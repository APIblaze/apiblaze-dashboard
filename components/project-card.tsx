'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Project } from '@/types/project';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DeploymentStatus } from '@/components/deployment-status';
import { ExternalLink, Settings, Trash2, Github, Globe, Loader2, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical } from 'lucide-react';
import { api } from '@/lib/api';
import type { AppClient } from '@/types/auth-config';

interface ProjectCardProps {
  project: Project;
  onUpdateConfig?: (project: Project) => void;
  onDelete?: (project: Project) => void;
}

export function ProjectCard({ project, onUpdateConfig, onDelete }: ProjectCardProps) {
  const [loadingClientId, setLoadingClientId] = useState(false);
  const [appClients, setAppClients] = useState<AppClient[]>([]);
  const [loadingAppClients, setLoadingAppClients] = useState(false);
  const [bringMyOwnOAuth, setBringMyOwnOAuth] = useState(false);

  // Fetch auth config and app clients when component mounts
  useEffect(() => {
    const fetchAuthData = async () => {
      const projectConfig = project.config as Record<string, unknown> | undefined;
      
      // Try multiple possible field names for auth config ID
      let authConfigId = (
        projectConfig?.auth_config_id || 
        projectConfig?.user_pool_id
      ) as string | undefined;

      // If no auth_config_id but we have default_app_client_id, try to find the auth config
      if (!authConfigId) {
        const defaultAppClientId = (projectConfig?.default_app_client_id || projectConfig?.defaultAppClient) as string | undefined;
        
        if (defaultAppClientId) {
          try {
            // List all auth configs and find which one contains this app client
            const allAuthConfigs = await api.listAuthConfigs();
            
            for (const config of allAuthConfigs) {
              try {
                const clients = await api.listAppClients(config.id);
                const hasAppClient = Array.isArray(clients) && clients.some(client => client.id === defaultAppClientId);
                
                if (hasAppClient) {
                  authConfigId = config.id;
                  console.log('[ProjectCard] Found auth config via app client lookup:', authConfigId);
                  break;
                }
              } catch (err) {
                // Continue to next auth config if this one fails
                console.warn(`[ProjectCard] Error checking auth config ${config.id}:`, err);
              }
            }
          } catch (error) {
            console.error('[ProjectCard] Error finding auth config via app client:', error);
          }
        }
      }

      if (!authConfigId) {
        return;
      }

      try {
        setLoadingAppClients(true);
        
        // Fetch auth config to check bringMyOwnOAuth flag
        const authConfig = await api.getAuthConfig(authConfigId);
        
        if (authConfig.bringMyOwnOAuth) {
          setBringMyOwnOAuth(true);
          
          // Fetch all app clients for this auth config
          const clients = await api.listAppClients(authConfigId);
          setAppClients(Array.isArray(clients) ? clients : []);
        } else {
          setBringMyOwnOAuth(false);
          setAppClients([]);
        }
      } catch (error) {
        console.error('Error fetching auth config or app clients:', error);
        // Fallback to default behavior on error
        setBringMyOwnOAuth(false);
        setAppClients([]);
      } finally {
        setLoadingAppClients(false);
      }
    };

    fetchAuthData();
  }, [project.config]);

  const handleOpenPortal = async (appClient?: AppClient) => {
    try {
      setLoadingClientId(true);
      
      // Get defaultAppClient and authConfigId from project config
      const projectConfig = project.config as Record<string, unknown> | undefined;
      const authConfigId = projectConfig?.auth_config_id as string | undefined;
      const defaultAppClientId = (projectConfig?.default_app_client_id || projectConfig?.defaultAppClient) as string | undefined;
      
      let portalUrl = project.api_version
        ? `${project.urls.portal}/${project.api_version}`
        : project.urls.portal;
      
      // If an app client is provided, use its clientId
      if (appClient) {
        if (appClient.clientId) {
          // Add /login?clientId={clientId} to the portal URL
          const url = new URL(portalUrl);
          url.pathname = url.pathname.endsWith('/') 
            ? `${url.pathname}login` 
            : `${url.pathname}/login`;
          url.searchParams.set('clientId', appClient.clientId);
          portalUrl = url.toString();
        }
      } else {
        // Legacy behavior: use defaultAppClient if no app client provided
        // If we have a default app client, fetch its clientId and add it as a query parameter
        if (defaultAppClientId && authConfigId) {
          try {
            const defaultAppClient = await api.getAppClient(authConfigId, defaultAppClientId);
            const clientId = (defaultAppClient as { client_id?: string; clientId?: string }).client_id || defaultAppClient.clientId;
            
            if (clientId) {
              // Default app client: just use the base portal URL (no /login needed)
              portalUrl = portalUrl;
            }
          } catch (error) {
            console.error('Error fetching app client details:', error);
            // Continue without clientId if fetch fails
          }
        } else if (defaultAppClientId) {
          // If we have defaultAppClientId but no authConfigId, log a warning
          console.warn('Default app client ID found but no user pool ID', { defaultAppClientId });
        }
      }
      
      window.open(portalUrl, '_blank');
    } catch (error) {
      console.error('Error opening portal:', error);
      // Fallback to opening portal without clientId
      const portalUrl = project.api_version
        ? `${project.urls.portal}/${project.api_version}`
        : project.urls.portal;
      window.open(portalUrl, '_blank');
    } finally {
      setLoadingClientId(false);
    }
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="text-xl">{project.display_name}</CardTitle>
              <Badge variant="secondary" className="text-xs">
                v{project.api_version}
              </Badge>
            </div>
            <CardDescription className="font-mono text-xs">
              {project.project_id}.apiblaze.com
            </CardDescription>
          </div>

          {/* Actions menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onUpdateConfig && (
                <DropdownMenuItem onClick={() => onUpdateConfig(project)}>
                  <Settings className="mr-2 h-4 w-4" />
                  Update Config
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => handleOpenPortal()} disabled={loadingClientId}>
                {loadingClientId ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="mr-2 h-4 w-4" />
                )}
                Open Portal
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {onDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(project)}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Project
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Deployment Status */}
        {project.deployment && (
          <div>
            <DeploymentStatus
              status={project.deployment.status}
              ageSeconds={project.deployment.age_seconds}
              durationSeconds={project.deployment.duration_seconds}
              error={project.deployment.error}
            />
          </div>
        )}

        {/* Source Information */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {project.spec_source.type === 'github' && project.spec_source.github && (
            <div className="flex items-center gap-2">
              <Github className="h-4 w-4" />
              <span className="font-mono text-xs">
                {project.spec_source.github.owner}/{project.spec_source.github.repo}
              </span>
              <Badge variant="outline" className="text-xs">
                {project.spec_source.github.branch}
              </Badge>
            </div>
          )}
          {project.spec_source.type === 'target_only' && (
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              <span className="text-xs">Target URL Only</span>
            </div>
          )}
          {project.spec_source.type === 'upload' && (
            <div className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4" />
              <span className="text-xs">Uploaded Spec</span>
            </div>
          )}
        </div>

        {/* Deployer Information */}
        <div className="flex items-center gap-2 pt-2 border-t">
          {project.deployer?.avatar_url ? (
            <Image
              src={project.deployer.avatar_url}
              alt={project.deployer.name || project.deployer.github_username || 'User'}
              width={24}
              height={24}
              className="h-6 w-6 rounded-full object-cover"
            />
          ) : (
            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-xs">
              {(project.deployer?.name || project.deployer?.github_username || 'U').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col">
            <span className="text-xs font-medium">
              {project.deployer?.name || project.deployer?.github_username || 'Unknown'}
            </span>
            {project.deployer?.email && (
              <span className="text-xs text-muted-foreground">{project.deployer.email}</span>
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex gap-2">
        {bringMyOwnOAuth && appClients.length > 1 ? (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="flex-1" disabled={loadingClientId}>
                  {loadingClientId ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="mr-2 h-4 w-4" />
                  )}
                  Open Portal
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {loadingAppClients ? (
                  <div className="flex items-center justify-center py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  appClients.map((client) => (
                    <DropdownMenuItem
                      key={client.id}
                      onClick={() => handleOpenPortal(client)}
                      disabled={loadingClientId}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {client.name}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {onUpdateConfig && (
              <Button variant="outline" size="sm" onClick={() => onUpdateConfig(project)} className="flex-1">
                <Settings className="mr-2 h-4 w-4" />
                Configure
              </Button>
            )}
          </>
        ) : bringMyOwnOAuth && appClients.length === 1 ? (
          <>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleOpenPortal(appClients[0])} 
              className="flex-1" 
              disabled={loadingClientId}
            >
              {loadingClientId ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              Open Portal
            </Button>
            {onUpdateConfig && (
              <Button variant="outline" size="sm" onClick={() => onUpdateConfig(project)} className="flex-1">
                <Settings className="mr-2 h-4 w-4" />
                Configure
              </Button>
            )}
          </>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={() => handleOpenPortal()} className="flex-1" disabled={loadingClientId}>
              {loadingClientId ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              Open Portal
            </Button>
            {onUpdateConfig && (
              <Button variant="outline" size="sm" onClick={() => onUpdateConfig(project)} className="flex-1">
                <Settings className="mr-2 h-4 w-4" />
                Configure
              </Button>
            )}
          </>
        )}
      </CardFooter>
    </Card>
  );
}