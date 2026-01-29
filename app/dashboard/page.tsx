'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Zap, Plus, GitBranch, Globe, Rocket, Bot, UserCog, Shield } from 'lucide-react';
import { UserMenu } from '@/components/user-menu';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreateProjectDialog } from '@/components/create-project-dialog';
import { ProjectList, ProjectListRef } from '@/components/project-list';
import { useDashboardCacheStore } from '@/store/dashboard-cache';
import { Project } from '@/types/project';

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const projectListRef = useRef<ProjectListRef>(null);

  const projects = useDashboardCacheStore((s) => s.projects);
  const isBootstrapping = useDashboardCacheStore((s) => s.isBootstrapping);
  const hasProjects = !isBootstrapping && projects.length > 0;
  const checkingProjects = isBootstrapping;
  
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login?returnUrl=/dashboard');
    }
  }, [status, router]);

  // Check for GitHub App installation callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Check for GitHub app installation callback (setup_action=install)
    const setupAction = urlParams.get('setup_action');
    const installationId = urlParams.get('installation_id');
    const openDialog = urlParams.get('open_create_dialog');
    
    // If we have GitHub installation parameters OR explicit open request
    if (setupAction === 'install' || installationId || openDialog === 'true') {
      // Set flags
      localStorage.setItem('github_app_installed', 'true');
      localStorage.setItem('github_app_just_installed', 'true');
      
      // Open create dialog with slight delay to ensure component is ready
      setTimeout(() => {
        setCreateDialogOpen(true);
      }, 100);
      
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const invalidateAndRefetch = useDashboardCacheStore((s) => s.invalidateAndRefetch);

  const handleProjectCreated = async () => {
    setCreateDialogOpen(false);
    const teamId = session?.user?.id ? `team_${(session.user as { id?: string }).id}` : undefined;
    await invalidateAndRefetch(teamId);
  };
  
  if (status === 'loading' || status === 'unauthenticated' || checkingProjects) {
    return null;
  }
  
  const user = session?.user;

  // Show zero state if no projects
  if (hasProjects === false) {
    return (
      <>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
        {/* Header */}
        <header className="border-b bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">APIBlaze v3.0</h1>
                <p className="text-xs text-muted-foreground">Host secure serverless APIs in seconds</p>
              </div>
            </div>
          
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => router.push('/dashboard/auth-configs')}>
                <UserCog className="mr-2 h-4 w-4" />
                User Pools
              </Button>
              <Button variant="outline" onClick={() => router.push('/dashboard/llm')}>
                <Bot className="mr-2 h-4 w-4" />
                Enable your API on LLMs
              </Button>
              <UserMenu />
            </div>
          </div>
        </header>
        
        {/* Main Content */}
        <main className="container mx-auto px-4 py-8">
          {/* Welcome Section */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold mb-2">
              Welcome, {user?.name || user?.githubHandle}! 👋
            </h2>
            <p className="text-muted-foreground">
              You haven&apos;t created any API proxies yet. Let&apos;s get started!
            </p>
          </div>
          
          {/* Zero State */}
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
              <Button size="lg" className="h-12 px-8" onClick={() => {
                setSelectedProject(null);
                setCreateDialogOpen(true);
              }}>
                <Plus className="mr-2 h-5 w-5" />
                Create Project
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 px-8"
                onClick={() => router.push('/dashboard/llm')}
              >
                <Bot className="mr-2 h-5 w-5" />
                Enable on LLMs
              </Button>
            </CardContent>
          </Card>
          
          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <GitBranch className="w-8 h-8 text-blue-600 mb-2" />
                <CardTitle className="text-lg">GitHub Integration</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Import OpenAPI specs directly from your GitHub repositories with one click.
                </CardDescription>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <Globe className="w-8 h-8 text-purple-600 mb-2" />
                <CardTitle className="text-lg">Custom Domains</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Deploy your APIs on custom *.apiblaze.com subdomains or bring your own domain.
                </CardDescription>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <Shield className="w-8 h-8 text-green-600 mb-2" />
                <CardTitle className="text-lg">Fine-grained authorization</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  It&apos;s super easy to define any policy you need. For example: only allow the user who created a resource with POST to later GET that same resource—so the author can read their own booking or document, but others can&apos;t.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </main>

        <CreateProjectDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSuccess={handleProjectCreated}
          openToGitHub={typeof window !== 'undefined' && localStorage.getItem('github_app_just_installed') === 'true'}
        />
      </div>
      </>
    );
  }

  // Show project list
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">APIBlaze v3.0</h1>
              <p className="text-xs text-muted-foreground">Host secure serverless APIs in seconds</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => router.push('/dashboard/auth-configs')}>
              <UserCog className="mr-2 h-4 w-4" />
              Auth Configs
            </Button>
            <Button variant="outline" onClick={() => router.push('/dashboard/llm')}>
              <Bot className="mr-2 h-4 w-4" />
              Enable your API on LLMs
            </Button>
            <Button onClick={() => {
              setSelectedProject(null);
              setCreateDialogOpen(true);
            }}>
              <Plus className="mr-2 h-4 w-4" />
              Create Project
            </Button>
            <UserMenu />
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <ProjectList 
          ref={projectListRef}
          teamId={user?.id ? `team_${user.id}` : undefined}
          onRefresh={async () => {
            const teamId = user?.id ? `team_${user.id}` : undefined;
            await invalidateAndRefetch(teamId);
          }}
          onUpdateConfig={(project: Project) => {
            setSelectedProject(project);
            setCreateDialogOpen(true);
          }}
        />
      </main>

      <CreateProjectDialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) {
            setSelectedProject(null);
          }
        }}
        onSuccess={handleProjectCreated}
        openToGitHub={typeof window !== 'undefined' && localStorage.getItem('github_app_just_installed') === 'true'}
        project={selectedProject}
        onProjectUpdate={(updatedProject) => {
          // Update selectedProject so dialog reflects changes immediately
          setSelectedProject(updatedProject);
        }}
      />
    </div>
  );
}
