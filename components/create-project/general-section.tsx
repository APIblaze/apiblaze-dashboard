'use client';

import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { GitBranch, Upload, Globe, Check, X, Loader2, Github, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { ProjectConfig, SourceType } from './types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GitHubRepoSelectorModal } from './github-repo-selector-modal';
import { GitHubAppInstallModal } from './github-app-install-modal';
import { fetchGitHubAPI } from '@/lib/github-api';
import { api } from '@/lib/api';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const REDEPLOY_TOOLTIP = "Project name and API version cannot be changed without a full redeploy. Use 'Delete and Redeploy' in the Danger Zone to change these.";

interface GeneralSectionProps {
  config: ProjectConfig;
  updateConfig: (updates: Partial<ProjectConfig>) => void;
  validationError?: 'project-name' | 'github-source' | 'target-url' | 'upload-file' | null;
  preloadedGitHubRepos?: Array<{ id: number; name: string; full_name: string; description: string; default_branch: string; updated_at: string; language: string; stargazers_count: number }>;
  /** Called when project name check completes. blockDeploy=true disables deploy; message is shown under the field. */
  onProjectNameCheckResult?: (blockDeploy: boolean, message?: string) => void;
  /** When editing an existing project, pass its project_id and api_version so "already exists" for this project is treated as valid. */
  editingProject?: { project_id: string; api_version: string } | null;
  /** Danger Zone: called when user clicks Delete and Redeploy (edit mode only) */
  onDeleteAndRedeploy?: () => void;
  /** Danger Zone: called when user clicks Delete (edit mode only) */
  onDelete?: () => void;
  /** Whether deploy/delete-and-redeploy is in progress */
  isDeploying?: boolean;
  /** Whether delete is in progress */
  isDeleting?: boolean;
}

const PROJECT_NAME_CHECK_DEBOUNCE_MS = 400;

export function GeneralSection({ config, updateConfig, validationError, preloadedGitHubRepos, onProjectNameCheckResult, editingProject, onDeleteAndRedeploy, onDelete, isDeploying, isDeleting }: GeneralSectionProps) {
  const [checkingName, setCheckingName] = useState(false);
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
  const [projectNameCheckMessage, setProjectNameCheckMessage] = useState<string | null>(null);
  const [repoSelectorOpen, setRepoSelectorOpen] = useState(false);
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [githubAppInstalled, setGithubAppInstalled] = useState(false);
  const [checkingInstallation, setCheckingInstallation] = useState(true);

  useEffect(() => {
    // Check if GitHub App is installed
    console.log('[General Section] Component mounted, checking GitHub installation');
    checkGitHubInstallation();
  }, []);

  // Re-check if app was just installed
  useEffect(() => {
    const justInstalled = localStorage.getItem('github_app_just_installed');
    console.log('[General Section] Checking just_installed flag:', justInstalled);
    if (justInstalled === 'true') {
      console.log('[General Section] App was just installed! Re-checking status...');
      // Clear the flag
      localStorage.removeItem('github_app_just_installed');
      // Re-check installation status
      setTimeout(() => {
        checkGitHubInstallation();
      }, 500); // Small delay to ensure token is ready
    }
  }, []);


  const checkGitHubInstallation = async () => {
    console.log('[GitHub] checkGitHubInstallation called');

    setCheckingInstallation(true);
    try {
      // Check URL parameter first (from GitHub callback)
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('github_app_installed') === 'true') {
        console.log('[GitHub] Found github_app_installed in URL');
        localStorage.setItem('github_app_installed', 'true');
        setGithubAppInstalled(true);
        setCheckingInstallation(false);
        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }

      // Always check actual installation status via API (using NextAuth session)
      console.log('[GitHub] Calling API to check installation status');
      const response = await fetchGitHubAPI('/api/github/installation-status', {
        cache: 'no-store', // Don't cache this, always get fresh status
      });

      console.log('[GitHub] Installation API response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        const isInstalled = data.installed === true;
        
        console.log('[GitHub] Installation check result:', data);
        
        // Update localStorage to match actual status
        if (isInstalled) {
          localStorage.setItem('github_app_installed', 'true');
        } else {
          localStorage.removeItem('github_app_installed');
        }
        
        setGithubAppInstalled(isInstalled);
      } else if (response.status === 401) {
        // 401 = Not authenticated or token invalid
        // fetchGitHubAPI will automatically log out the user, so we just need to clean up local state
        console.warn('[GitHub] 401 Unauthorized - User will be logged out');
        localStorage.removeItem('github_app_installed');
        setGithubAppInstalled(false);
      } else {
        // Other errors - assume not installed
        console.error('[GitHub] API check failed with status:', response.status);
        localStorage.removeItem('github_app_installed');
        setGithubAppInstalled(false);
      }
    } catch (error) {
      console.error('[GitHub] Error checking installation:', error);
      // On error, assume not installed to be safe
      localStorage.removeItem('github_app_installed');
      setGithubAppInstalled(false);
    } finally {
      setCheckingInstallation(false);
      console.log('[GitHub] Installation check complete');
    }
  };

  const handleBrowseGitHub = () => {
    // Always open modal immediately - don't wait for preload or installation check
    // The modal will handle loading states internally (using cache or API)
    setRepoSelectorOpen(true);
    
    // Check installation in background (non-blocking)
    // This will update the state but won't block the modal from opening
    void checkInstallationInBackground();
  };

  const checkInstallationInBackground = async () => {
    // Re-check installation status in background (using NextAuth session)
    try {
      console.log('[GitHub] handleBrowseGitHub - checking installation in background');
      const response = await fetchGitHubAPI('/api/github/installation-status', {
        cache: 'no-store',
      });

      if (response.ok) {
        const data = await response.json();
        const isInstalled = data.installed === true;
        
        console.log('Installation check result:', data);
        
        // Update localStorage and state
        if (isInstalled) {
          localStorage.setItem('github_app_installed', 'true');
          setGithubAppInstalled(true);
          // If modal is open and we thought it wasn't installed, it's fine now
        } else {
          localStorage.removeItem('github_app_installed');
          setGithubAppInstalled(false);
          // Only show install modal if repo selector is not open (user hasn't seen repos)
          if (!repoSelectorOpen) {
            setInstallModalOpen(true);
          }
        }
      } else if (response.status === 401) {
        // 401 = Credentials expired, fetchGitHubAPI will log out the user
        console.warn('[GitHub] 401 Unauthorized - User will be logged out');
        localStorage.removeItem('github_app_installed');
        setGithubAppInstalled(false);
        // Close repo selector if open, user will be redirected to login
        if (repoSelectorOpen) {
          setRepoSelectorOpen(false);
        }
      } else {
        // On error, update state but don't block
        localStorage.removeItem('github_app_installed');
        setGithubAppInstalled(false);
        // Only show install modal if repo selector is not open
        if (!repoSelectorOpen) {
          setInstallModalOpen(true);
        }
      }
    } catch (error) {
      console.error('Error checking installation:', error);
      // On error, update state but don't block
      localStorage.removeItem('github_app_installed');
      setGithubAppInstalled(false);
      // Only show install modal if repo selector is not open
      if (!repoSelectorOpen) {
        setInstallModalOpen(true);
      }
    }
  };

  // Run project name check whenever projectName or apiVersion change (debounced; also runs when autopopulated e.g. from GitHub spec)
  useEffect(() => {
    const name = config.projectName?.trim();
    const version = config.apiVersion?.trim() || '1.0.0';

    if (!name) {
      setNameAvailable(null);
      setProjectNameCheckMessage(null);
      onProjectNameCheckResult?.(false);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setCheckingName(true);
      setProjectNameCheckMessage(null);
      onProjectNameCheckResult?.(false);
      try {
        const result = await api.checkProjectName(name, version);

        // When editing this same project, "already exists with this version" is expected — don't block
        const isEditingThisProject =
          editingProject &&
          name.toLowerCase() === editingProject.project_id.toLowerCase() &&
          version === (editingProject.api_version || '1.0.0');

        // Block deploy: Scenario 1 (same team, same version exists) or Scenario 3 (other team owns name) — unless we're editing that project
        const blockDeploy =
          !isEditingThisProject &&
          ((result.exists && result.api_version !== null && result.message?.includes('already created this project with this version')) ||
            (result.exists && result.api_version === null && result.message?.includes('Another team owns')));

        if (blockDeploy) {
          setNameAvailable(false);
          setProjectNameCheckMessage(result.message ?? 'This project name or version is not available.');
          onProjectNameCheckResult?.(true, result.message);
        } else {
          setNameAvailable(true);
          setProjectNameCheckMessage(null);
          onProjectNameCheckResult?.(false);
        }
      } catch {
        setNameAvailable(false);
        const message = 'Could not verify project name. Try again or deploy anyway.';
        setProjectNameCheckMessage(message);
        onProjectNameCheckResult?.(false); // Don't block deploy on network/API error
      } finally {
        setCheckingName(false);
      }
    }, PROJECT_NAME_CHECK_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onProjectNameCheckResult is intentionally omitted to avoid resetting debounce on every parent render
  }, [config.projectName, config.apiVersion, editingProject?.project_id, editingProject?.api_version]);

  const handleSourceTypeChange = (type: SourceType) => {
    // Target URL and Upload are disabled for now (not code-based)
    if (type === 'targetUrl' || type === 'upload') return;
    updateConfig({ sourceType: type });
  };

  // Force GitHub when Target URL or Upload would be selected (those options are disabled)
  useEffect(() => {
    if (config.sourceType === 'targetUrl' || config.sourceType === 'upload') {
      updateConfig({ sourceType: 'github' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateConfig is stable; only reset when sourceType is disabled
  }, [config.sourceType]);

  return (
    <div className="space-y-6">
      {/* Source Selection */}
      <div>
        <Label className="text-base font-semibold">Source</Label>
        <p className="text-sm text-muted-foreground mb-3">
          Choose how to configure your API
        </p>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card 
            className={`cursor-pointer transition-all ${
              config.sourceType === 'github' 
                ? 'border-blue-600 ring-2 ring-blue-600 ring-offset-2' 
                : 'hover:border-blue-400'
            }`}
            onClick={() => handleSourceTypeChange('github')}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <GitBranch className="h-5 w-5 text-blue-600" />
                <Badge variant="secondary" className="text-xs">Recommended</Badge>
              </div>
              <CardTitle className="text-sm">GitHub</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-xs">
                Import OpenAPI spec from your repository
              </CardDescription>
            </CardContent>
          </Card>

          <Card 
            className="cursor-not-allowed opacity-60 transition-all"
            aria-disabled="true"
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Globe className="h-5 w-5 text-purple-600" />
                <Badge variant="outline" className="text-xs">Coming soon</Badge>
              </div>
              <CardTitle className="text-sm">Target URL</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-xs">
                Manually configure target backend
              </CardDescription>
            </CardContent>
          </Card>

          <Card 
            className="cursor-not-allowed opacity-60 transition-all"
            aria-disabled="true"
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Upload className="h-5 w-5 text-green-600" />
                <Badge variant="outline" className="text-xs">Coming soon</Badge>
              </div>
              <CardTitle className="text-sm">Upload</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-xs">
                Upload OpenAPI spec file
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* GitHub Source */}
        {config.sourceType === 'github' && (
          <div className="space-y-4 p-4 border rounded-lg bg-muted/30">

            {/* GitHub Spec Selected Summary */}
            {config.githubUser && config.githubRepo && config.githubPath ? (
              <Card className="border-green-200 bg-green-50/50">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Check className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium text-green-900">
                          OpenAPI Spec Selected
                        </span>
                      </div>
                      <p className="text-xs text-green-700 font-mono">
                        {config.githubUser}/{config.githubRepo}/{config.githubPath}
                      </p>
                      <p className="text-xs text-green-700 mt-1">
                        Branch: {config.githubBranch}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          updateConfig({
                            githubUser: '',
                            githubRepo: '',
                            githubPath: '',
                            githubBranch: 'main',
                          });
                        }}
                      >
                        Clear
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleBrowseGitHub}
                      >
                        Change
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className={`border-blue-200 bg-gradient-to-br from-blue-50/50 to-purple-50/50 ${
                validationError === 'github-source' ? 'ring-2 ring-red-500 ring-offset-2 border-red-500' : ''
              }`}>
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Github className="w-7 h-7 text-white" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-base mb-2">
                        Import API Spec from GitHub
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {githubAppInstalled 
                          ? 'Browse your repositories and select an OpenAPI specification'
                          : 'Import API specs in one click by linking to GitHub'
                        }
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button onClick={handleBrowseGitHub} className="w-full">
                    <Github className="mr-2 h-4 w-4" />
                    {githubAppInstalled ? 'Browse Repositories' : 'Import from GitHub'}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Modals */}
            <GitHubRepoSelectorModal
              open={repoSelectorOpen}
              onOpenChange={setRepoSelectorOpen}
              config={config}
              updateConfig={updateConfig}
              preloadedRepos={preloadedGitHubRepos}
            />
            
            <GitHubAppInstallModal
              open={installModalOpen}
              onOpenChange={setInstallModalOpen}
            />
          </div>
        )}

        {/* Target URL Source */}
        {config.sourceType === 'targetUrl' && (
          <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
            <div>
              <Label htmlFor="targetUrl" className="text-sm">Target Backend URL</Label>
              <Input
                id="targetUrl"
                placeholder="https://api.example.com"
                value={config.targetUrl}
                onChange={(e) => updateConfig({ targetUrl: e.target.value })}
                className={`mt-1 ${validationError === 'target-url' ? 'border-red-500 ring-2 ring-red-500 ring-offset-2' : ''}`}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter the URL of your backend API that this proxy will forward requests to
              </p>
            </div>
          </div>
        )}

        {/* Upload Source */}
        {config.sourceType === 'upload' && (
          <div className={`space-y-4 p-4 border rounded-lg bg-muted/30 ${
            validationError === 'upload-file' ? 'ring-2 ring-red-500 ring-offset-2 border-red-500' : ''
          }`}>
            <div>
              <Label htmlFor="uploadFile" className="text-sm">OpenAPI Specification File</Label>
              <div className="mt-2 flex items-center gap-3">
                <Button 
                  variant={validationError === 'upload-file' ? 'destructive' : 'outline'} 
                  size="sm" 
                  asChild
                >
                  <label htmlFor="uploadFile" className="cursor-pointer">
                    <Upload className="mr-2 h-4 w-4" />
                    Choose File
                  </label>
                </Button>
                <input
                  id="uploadFile"
                  type="file"
                  accept=".yaml,.yml,.json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      updateConfig({ uploadedFile: file });
                    }
                  }}
                />
                {config.uploadedFile && (
                  <span className="text-sm text-muted-foreground">
                    {config.uploadedFile.name}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Upload your OpenAPI 3.0 specification file (YAML or JSON format)
              </p>
              <Badge variant="outline" className="mt-2 text-xs">
                UI Only - Backend integration coming soon
              </Badge>
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Project Name and API Version */}
      <div>
        <Label htmlFor="projectName" className="text-base font-semibold">
          Project Name & API Version
        </Label>
        <p className="text-sm text-muted-foreground mb-3">
          This determines the URL your API will be accessible at
        </p>
        
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            {editingProject ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-block w-full">
                    <Input
                      id="projectName"
                      placeholder="myawesomeapi"
                      value={config.projectName}
                      readOnly
                      className="pr-10 bg-muted cursor-not-allowed opacity-90"
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p>{REDEPLOY_TOOLTIP}</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <>
                <Input
                  id="projectName"
                  placeholder="myawesomeapi"
                  value={config.projectName}
                  onChange={(e) => updateConfig({ projectName: e.target.value })}
                  className={`pr-10 ${validationError === 'project-name' || nameAvailable === false ? 'border-red-500 ring-2 ring-red-500 ring-offset-2' : ''}`}
                />
                {checkingName && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {!checkingName && nameAvailable === true && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-600" />
                )}
                {!checkingName && nameAvailable === false && (
                  <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-600" />
                )}
              </>
            )}
          </div>
          <span className="text-muted-foreground">.apiblaze.com</span>
          <span className="text-muted-foreground">/</span>
          {editingProject ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block">
                  <Input
                    placeholder="1.0.0"
                    value={config.apiVersion}
                    readOnly
                    className="w-32 bg-muted cursor-not-allowed opacity-90"
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p>{REDEPLOY_TOOLTIP}</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <Input
              placeholder="1.0.0"
              value={config.apiVersion}
              onChange={(e) => updateConfig({ apiVersion: e.target.value })}
              className="w-32"
            />
          )}
        </div>
        
        {config.projectName && (
          <p className="text-sm text-muted-foreground mt-2">
            Your API will be available at: <span className="font-mono text-blue-600">
              {config.projectName}.apiblaze.com/{config.apiVersion}
            </span>
          </p>
        )}
        {projectNameCheckMessage && nameAvailable === false && (
          <p className="text-sm text-red-600 mt-2 flex items-center gap-1.5" role="alert">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {projectNameCheckMessage}
          </p>
        )}
      </div>

      {/* Danger Zone - edit mode only */}
      {editingProject && (onDeleteAndRedeploy || onDelete) && (
        <DangerZone
          onDeleteAndRedeploy={onDeleteAndRedeploy}
          onDelete={onDelete}
          isDeploying={isDeploying}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}

function DangerZone({
  onDeleteAndRedeploy,
  onDelete,
  isDeploying,
  isDeleting,
}: {
  onDeleteAndRedeploy?: () => void;
  onDelete?: () => void;
  isDeploying?: boolean;
  isDeleting?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const busy = isDeploying || isDeleting;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 py-3 text-left text-foreground font-medium hover:text-foreground/80 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        Danger Zone
      </button>
      {open && (
        <div className="flex flex-col items-start gap-3 pt-1">
          {onDeleteAndRedeploy && (
            <Button
              variant="destructive"
              onClick={onDeleteAndRedeploy}
              disabled={busy}
            >
              {isDeploying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting and redeploying...
                </>
              ) : (
                'Delete and Redeploy'
              )}
            </Button>
          )}
          {onDelete && (
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={busy}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete project'
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

