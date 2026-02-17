'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Plus, GitBranch, Globe, Rocket, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProjectSelectorValue } from '@/components/project-selector';
import type { ProjectConfigTab } from '@/components/dashboard-shell';
import { ProjectList, ProjectListRef } from '@/components/project-list';
import { ProjectConfigPanel } from '@/components/create-project/project-config-panel';
import { DashboardShell } from '@/components/dashboard-shell';
import { useDashboardCacheStore } from '@/store/dashboard-cache';
import { fetchGitHubAPI } from '@/lib/github-api';
import { Project } from '@/types/project';
import { cn } from '@/lib/utils';

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const projectListRef = useRef<ProjectListRef>(null);

  const [selectorValue, setSelectorValue] = useState<ProjectSelectorValue>({ type: 'team' });
  const [projectActiveTab, setProjectActiveTab] = useState<ProjectConfigTab>('general');
  const [preloadedGitHubRepos, setPreloadedGitHubRepos] = useState<
    Array<{ id: number; name: string; full_name: string; description: string; default_branch: string; updated_at: string; language: string; stargazers_count: number }>
  >([]);

  const projects = useDashboardCacheStore((s) => s.projects);
  const isBootstrapping = useDashboardCacheStore((s) => s.isBootstrapping);
  const hasProjects = !isBootstrapping && projects.length > 0;
  const invalidateAndRefetch = useDashboardCacheStore((s) => s.invalidateAndRefetch);
  const teamId = session?.user?.id ? `team_${(session.user as { id?: string }).id}` : undefined;

  // Initialize from URL params
  useEffect(() => {
    const projectId = searchParams.get('project');
    const isNew = searchParams.get('new') === '1';
    if (isNew) {
      setSelectorValue({ type: 'new' });
    } else if (projectId) {
      const project = projects.find((p) => p.project_id === projectId);
      if (project) {
        setSelectorValue({ type: 'project', project });
      }
    } else {
      setSelectorValue({ type: 'team' });
    }
  }, [searchParams, projects]);

  // GitHub callback redirect
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const setupAction = urlParams.get('setup_action');
    const installationId = urlParams.get('installation_id');
    const openDialog = urlParams.get('open_create_dialog');
    if (setupAction === 'install' || installationId || openDialog === 'true') {
      localStorage.setItem('github_app_installed', 'true');
      localStorage.setItem('github_app_just_installed', 'true');
      setSelectorValue({ type: 'new' });
      window.history.replaceState({}, '', '/dashboard');
    }
  }, []);

  // When entering new project flow, redirect off Routes tab if it was selected (Routes hidden for new projects)
  useEffect(() => {
    if (selectorValue.type === 'new' && projectActiveTab === 'routes') {
      setProjectActiveTab('general');
    }
  }, [selectorValue.type, projectActiveTab]);

  // Preload GitHub repos when in project scope
  useEffect(() => {
    const isProjectScope = selectorValue.type === 'project' || selectorValue.type === 'new';
    if (!isProjectScope) return;
    const loadRepos = async () => {
      try {
        const statusRes = await fetchGitHubAPI('/api/github/installation-status', { cache: 'no-store' });
        if (statusRes.ok) {
          const data = await statusRes.json() as { installed?: boolean };
          if (data.installed) {
            const reposRes = await fetchGitHubAPI('/api/github/repos');
            if (reposRes.ok) {
              const repos = await reposRes.json() as Array<{ id: number; name: string; full_name: string; description: string; default_branch: string; updated_at: string; language: string; stargazers_count: number }>;
              setPreloadedGitHubRepos(Array.isArray(repos) ? repos : []);
            }
          }
        }
      } catch {
        // Silently fail
      }
    };
    void loadRepos();
  }, [selectorValue.type]);

  const handleDeploySuccess = useCallback(async () => {
    await invalidateAndRefetch(teamId);
    setSelectorValue({ type: 'team' });
  }, [invalidateAndRefetch, teamId]);

  const handleCancelProject = useCallback(() => {
    setSelectorValue({ type: 'team' });
    setProjectActiveTab('general');
    router.push('/dashboard');
  }, [router]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login?returnUrl=/dashboard');
    }
  }, [status, router]);

  const isTeamScope = selectorValue.type === 'team';
  const isProjectScope = selectorValue.type === 'project' || selectorValue.type === 'new';
  const currentProject: Project | null =
    selectorValue.type === 'project' ? selectorValue.project : selectorValue.type === 'new' ? null : null;

  if (status === 'loading' || status === 'unauthenticated') {
    return null;
  }

  const user = session?.user;

  // Wait for bootstrap before rendering; avoid zero-state flicker
  if (isBootstrapping) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // Zero state - no projects yet; show selector and either welcome or create form
  if (!hasProjects) {
    const showCreateForm = selectorValue.type === 'new';
    return (
      <DashboardShell
        selectorValue={selectorValue}
        onSelectorChange={setSelectorValue}
        githubHandle={(user as { githubHandle?: string | null })?.githubHandle}
        teamId={teamId}
        userId={(session?.user as { id?: string })?.id}
        projectSubmenu={undefined}
        hasProjects={false}
      >
        <main className="w-full px-4 py-8">
          <div className={cn(
            'container mx-auto',
            projectActiveTab === 'routes' ? 'max-w-[80vw]' : 'max-w-6xl'
          )}>
            {showCreateForm ? (
              <ProjectConfigPanel
                project={null}
                preloadedGitHubRepos={preloadedGitHubRepos}
                onDeploySuccess={handleDeploySuccess}
                onCancel={handleCancelProject}
                activeTab={projectActiveTab}
                onTabChange={setProjectActiveTab}
              />
            ) : (
              <>
                <div className="mb-8">
                  <h2 className="text-3xl font-bold mb-2">Welcome, {user?.name || (user as { githubHandle?: string })?.githubHandle}! 👋</h2>
                  <p className="text-muted-foreground">You haven&apos;t created any API proxies yet. Let&apos;s get started!</p>
                </div>
                <Card className="mb-8 border-2 border-dashed">
                  <CardHeader className="text-center pb-4">
                    <div className="mx-auto w-20 h-20 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-950 dark:to-purple-950 rounded-2xl flex items-center justify-center mb-4">
                      <Rocket className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                    </div>
                    <CardTitle className="text-2xl">Create Your First API Project</CardTitle>
                    <CardDescription className="text-base">
                      Deploy your API proxy in seconds using GitHub, upload, or manual configuration
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col sm:flex-row items-center justify-center gap-3 pb-6">
                    <Button size="lg" className="h-12 px-8" onClick={() => setSelectorValue({ type: 'new' })}>
                      <Plus className="mr-2 h-5 w-5" />
                      Create Project
                    </Button>
                  </CardContent>
                </Card>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card>
                    <CardHeader>
                      <GitBranch className="w-8 h-8 text-blue-600 mb-2" />
                      <CardTitle className="text-lg">GitHub Integration</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription>Import OpenAPI specs directly from your GitHub repositories with one click.</CardDescription>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <Globe className="w-8 h-8 text-purple-600 mb-2" />
                      <CardTitle className="text-lg">Custom Domains</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription>Deploy your APIs on custom *.apiblaze.com subdomains or bring your own domain.</CardDescription>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <Shield className="w-8 h-8 text-green-600 mb-2" />
                      <CardTitle className="text-lg">Fine-grained authorization</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription>Define any policy you need. Only allow the user who created a resource to later GET that same resource.</CardDescription>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </div>
        </main>
      </DashboardShell>
    );
  }

  // Main layout: DashboardShell + content
  const tab = searchParams.get('tab');

  return (
    <DashboardShell
      selectorValue={selectorValue}
      onSelectorChange={setSelectorValue}
      githubHandle={(user as { githubHandle?: string | null })?.githubHandle}
      teamId={teamId}
      userId={(session?.user as { id?: string })?.id}
        projectSubmenu={isProjectScope && selectorValue.type === 'project' ? { activeTab: projectActiveTab, onTabChange: setProjectActiveTab } : undefined}
    >
      <main className={cn('w-full px-4 pb-8', isProjectScope ? 'pt-4' : 'pt-8')}>
        <div className={cn(
          'container mx-auto',
          isProjectScope && projectActiveTab === 'routes' ? 'max-w-[80vw]' : 'max-w-6xl'
        )}>
          {isTeamScope ? (
            <>
              {tab === 'settings' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Team Settings</CardTitle>
                    <CardDescription>Manage your team configuration and preferences.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Use Auth Configs to manage user pools and OAuth providers.
                    </p>
                    <Button variant="outline" asChild>
                      <a href="/dashboard/auth-configs">
                        Manage Auth Configs
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              )}
              {tab === 'developers' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Developers</CardTitle>
                    <CardDescription>Developer resources and API documentation.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Developer documentation and API references.
                    </p>
                  </CardContent>
                </Card>
              )}
              {tab === 'profile' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Profile</CardTitle>
                    <CardDescription>Your account and profile information.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">Profile settings can be accessed from the user menu in the top right.</p>
                    <div className="flex gap-2">
                      <span className="text-sm font-medium">{user?.name || (user as { githubHandle?: string })?.githubHandle}</span>
                      {user?.email && <span className="text-sm text-muted-foreground">({user.email})</span>}
                    </div>
                  </CardContent>
                </Card>
              )}
              {tab !== 'settings' && tab !== 'developers' && tab !== 'profile' && (
                <ProjectList
                  ref={projectListRef}
                  teamId={teamId}
                  onRefresh={async () => await invalidateAndRefetch(teamId)}
                  onUpdateConfig={(project: Project) => setSelectorValue({ type: 'project', project })}
                  onNewProject={() => setSelectorValue({ type: 'new' })}
                />
              )}
            </>
          ) : (
            <ProjectConfigPanel
              project={currentProject}
              preloadedGitHubRepos={preloadedGitHubRepos}
              onDeploySuccess={handleDeploySuccess}
              onProjectUpdate={(updated) => setSelectorValue({ type: 'project', project: updated })}
              onCancel={handleCancelProject}
              activeTab={projectActiveTab}
              onTabChange={setProjectActiveTab}
            />
          )}
        </div>
      </main>
    </DashboardShell>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
