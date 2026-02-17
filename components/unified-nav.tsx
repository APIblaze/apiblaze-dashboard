'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ChevronsUpDown, FolderCog, Zap, UserCog, KeyRound, Shield, Search, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useDashboardCacheStore } from '@/store/dashboard-cache';
import type { Project } from '@/types/project';
import { cn } from '@/lib/utils';

interface UnifiedNavProps {
  selectorValue: { type: 'team' } | { type: 'new' } | { type: 'project'; project: Project };
  onSelectorChange: (value: { type: 'team' } | { type: 'new' } | { type: 'project'; project: Project }) => void;
  githubHandle?: string | null;
  teamId?: string;
  userId?: string | null;
  authConfigId?: string | null;
  clientId?: string | null;
  providerId?: string | null;
  /** Show Projects section in dropdown (when Projects submenu is highlighted) */
  showProjectsSection?: boolean;
  /** Show Auth Configs section in dropdown (when Auth Configs submenu is highlighted) */
  showAuthConfigsSection?: boolean;
  className?: string;
}

function getTeamLabel(teamId?: string, userId?: string | null, githubHandle?: string | null): string {
  const effectiveTeamId = teamId ?? (userId ? `team_${userId}` : undefined);
  const isPersonalTeam = !!effectiveTeamId && !!userId && effectiveTeamId === `team_${userId}`;
  return isPersonalTeam && githubHandle ? `${githubHandle}'s projects` : 'Team';
}

export function UnifiedNav({
  selectorValue,
  onSelectorChange,
  githubHandle,
  teamId,
  userId,
  authConfigId,
  clientId,
  providerId,
  showProjectsSection = true,
  showAuthConfigsSection = false,
  className,
}: UnifiedNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [authSearch, setAuthSearch] = useState('');
  const projectInputRef = useRef<HTMLInputElement>(null);
  const authInputRef = useRef<HTMLInputElement>(null);

  const projects = useDashboardCacheStore((s) => s.projects);
  const authConfigs = useDashboardCacheStore((s) => s.getAuthConfigs());
  const getAuthConfig = useDashboardCacheStore((s) => s.getAuthConfig);
  const getAppClient = useDashboardCacheStore((s) => s.getAppClient);
  const getProviders = useDashboardCacheStore((s) => s.getProviders);
  const isBootstrapping = useDashboardCacheStore((s) => s.isBootstrapping);

  const teamLabel = getTeamLabel(teamId, userId, githubHandle);
  const isAuthConfigs = pathname === '/dashboard/auth-configs';
  const hasAuthDrillDown = !!(authConfigId || clientId || providerId);
  const authConfig = authConfigId ? getAuthConfig(authConfigId) : null;
  const appClient = authConfigId && clientId ? getAppClient(authConfigId, clientId) : null;
  const providers = authConfigId && clientId ? getProviders(authConfigId, clientId) : [];
  const provider = providerId ? providers.find((p) => p.id === providerId) : null;

  const PROVIDER_TYPE_LABELS: Record<string, string> = {
    google: 'Google',
    github: 'GitHub',
    microsoft: 'Microsoft',
    facebook: 'Facebook',
    auth0: 'Auth0',
    other: 'Other',
  };
  const providerDisplayName = provider ? (PROVIDER_TYPE_LABELS[provider.type] ?? provider.type) : providerId ?? 'Provider';

  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return projects;
    const q = projectSearch.toLowerCase().trim();
    return projects.filter((p) => p.display_name.toLowerCase().includes(q) || p.project_id.toLowerCase().includes(q));
  }, [projects, projectSearch]);

  const filteredAuthConfigs = useMemo(() => {
    if (!authSearch.trim()) return authConfigs;
    const q = authSearch.toLowerCase().trim();
    return authConfigs.filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
  }, [authConfigs, authSearch]);

  useEffect(() => {
    if (open) {
      setProjectSearch('');
      setAuthSearch('');
    }
  }, [open]);

  const handleProjectSelect = (v: { type: 'team' } | { type: 'new' } | { type: 'project'; project: Project }) => {
    onSelectorChange(v);
    if (v.type !== 'team') setOpen(false);
    if (v.type === 'team') router.push('/dashboard');
    if (v.type === 'new') router.push('/dashboard?new=1');
    if (v.type === 'project') router.push(`/dashboard?project=${v.project.project_id}`);
  };

  const handleAuthSelect = (id: string | null) => {
    if (id) router.push(`/dashboard/auth-configs?authConfig=${encodeURIComponent(id)}`);
    else router.push('/dashboard/auth-configs');
    setOpen(false);
  };

  const projectsHeaderLabel = githubHandle ? `All ${githubHandle}'s projects` : 'All projects';
  const authConfigsHeaderLabel = githubHandle ? `${githubHandle}'s auth configs` : 'auth configs';

  const navToProjectsList = () => {
    onSelectorChange({ type: 'team' });
    router.push('/dashboard');
  };
  const navToAuthConfigsList = () => router.push('/dashboard/auth-configs');
  const navToAuthConfig = () => authConfigId && router.push(`/dashboard/auth-configs?authConfig=${encodeURIComponent(authConfigId)}`);
  const navToAppClient = () => authConfigId && clientId && router.push(`/dashboard/auth-configs?authConfig=${encodeURIComponent(authConfigId)}&client=${encodeURIComponent(clientId)}`);

  const triggerBaseClass = 'flex items-center gap-2 rounded-md border bg-background px-3 py-2 min-h-9 text-left';
  const segmentClass = 'text-sm font-medium hover:underline truncate';

  const renderBreadcrumb = () => {
    if (isAuthConfigs) {
      if (hasAuthDrillDown) {
      return (
        <>
          <div className="w-6 h-6 rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 flex items-center justify-center shrink-0">
            <UserCog className="h-3 w-3 text-white" />
          </div>
          <button type="button" onClick={navToAuthConfigsList} className={cn(segmentClass, 'overflow-visible whitespace-nowrap shrink-0')}>
            {authConfigsHeaderLabel}
          </button>
          {authConfigId && (
            <>
              <span className="text-muted-foreground/60 select-none">/</span>
              <div className="w-6 h-6 rounded-md bg-gradient-to-b from-purple-400 to-purple-700 flex items-center justify-center shrink-0">
                <UserCog className="h-3 w-3 text-white" />
              </div>
              <button
                type="button"
                onClick={(clientId || providerId) ? navToAuthConfig : undefined}
                className={cn(segmentClass, 'overflow-visible whitespace-nowrap shrink-0', !clientId && !providerId && 'cursor-default hover:no-underline')}
              >
                {authConfig?.name ?? authConfigId}
              </button>
            </>
          )}
          {clientId && authConfigId && (
            <>
              <span className="text-muted-foreground/60 select-none">/</span>
              <div className="w-6 h-6 rounded-md bg-gradient-to-b from-purple-400 to-purple-700 flex items-center justify-center shrink-0">
                <KeyRound className="h-3 w-3 text-white" />
              </div>
              <button
                type="button"
                onClick={providerId ? navToAppClient : undefined}
                className={cn(segmentClass, 'overflow-visible whitespace-nowrap shrink-0', !providerId && 'cursor-default hover:no-underline')}
              >
                {appClient?.name ?? clientId}
              </button>
            </>
          )}
          {providerId && (
            <>
              <span className="text-muted-foreground/60 select-none">/</span>
              <div className="w-6 h-6 rounded-md bg-gradient-to-b from-purple-400 to-purple-700 flex items-center justify-center shrink-0">
                <Shield className="h-3 w-3 text-white" />
              </div>
              <span className={cn(segmentClass, 'overflow-visible whitespace-nowrap shrink-0 cursor-default')}>{providerDisplayName}</span>
            </>
          )}
        </>
      );
      }
      return (
        <>
          <div className="w-6 h-6 rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 flex items-center justify-center shrink-0">
            <UserCog className="h-3 w-3 text-white" />
          </div>
          <button type="button" onClick={navToAuthConfigsList} className={cn(segmentClass, 'overflow-visible whitespace-nowrap shrink-0')}>
            {authConfigsHeaderLabel}
          </button>
        </>
      );
    }

    if (selectorValue.type === 'project') {
      return (
        <>
          <div className="w-6 h-6 rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 flex items-center justify-center shrink-0">
            <FolderCog className="h-3 w-3 text-white" />
          </div>
          <button type="button" onClick={navToProjectsList} className={cn(segmentClass, 'overflow-visible whitespace-nowrap shrink-0')}>
            {teamLabel}
          </button>
          <span className="text-muted-foreground/60 select-none">/</span>
          <div className="w-6 h-6 rounded-md bg-gradient-to-b from-purple-400 to-purple-700 flex items-center justify-center shrink-0">
            <Zap className="h-3 w-3 text-white" />
          </div>
          <span className={cn(segmentClass, 'max-w-[200px] cursor-default')}>{selectorValue.project.display_name} <span className="text-muted-foreground">v{selectorValue.project.api_version}</span></span>
        </>
      );
    }

    const displayLabel = selectorValue.type === 'team' ? teamLabel : selectorValue.type === 'new' ? 'New project' : 'Select';
    const navHandler = selectorValue.type === 'new' ? () => router.push('/dashboard?new=1') : navToProjectsList;
    return (
      <>
        <div className="w-6 h-6 rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 flex items-center justify-center shrink-0">
          <FolderCog className="h-3 w-3 text-white" />
        </div>
        <button type="button" onClick={navHandler} className={cn(segmentClass, selectorValue.type !== 'new' && 'overflow-visible whitespace-nowrap shrink-0')}>
          {displayLabel}
        </button>
      </>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn(triggerBaseClass, className)}>
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          {renderBreadcrumb()}
        </div>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="shrink-0 p-1 -m-1 rounded hover:bg-accent transition-colors"
            aria-label="Open selector"
          >
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent
        className="p-0 w-[540px]"
        align="start"
      >
        <div className="flex max-h-[420px]">
          {/* Left: Team - shown for both Projects and Auth Configs */}
          {(showProjectsSection || showAuthConfigsSection) && (
            <div className="w-[200px] border-r shrink-0 flex flex-col">
              <div className="px-3 py-2 border-b font-medium text-sm">Team</div>
              <div className="p-2 flex-1 space-y-0.5">
                <button
                  type="button"
                  onClick={() => handleProjectSelect({ type: 'team' })}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent rounded-md',
                    selectorValue.type === 'team' && !isAuthConfigs && 'bg-accent'
                  )}
                >
                  <FolderCog className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{githubHandle ? `Team ${githubHandle}` : teamLabel}</span>
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent rounded-md text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  Add a new team
                </button>
              </div>
            </div>
          )}

          {/* Projects section - only when Projects submenu is highlighted */}
          {showProjectsSection && (
            <div className="flex-1 min-w-0 flex flex-col">
              <button
                type="button"
                onClick={() => {
                  handleProjectSelect({ type: 'team' });
                  setOpen(false);
                }}
                className="px-3 py-2 font-medium text-sm text-left hover:bg-accent rounded-t-md transition-colors flex items-center gap-2 w-full"
              >
                {projectsHeaderLabel}
              </button>
              <div className="border-b px-2 pb-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={projectInputRef}
                    placeholder="Search projects..."
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
              </div>
              <div className="overflow-y-auto max-h-[200px] py-1">
                {isBootstrapping && projects.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-muted-foreground text-center">Loading...</div>
                ) : filteredProjects.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                    {projectSearch ? 'No projects match.' : 'No projects yet.'}
                  </div>
                ) : (
                  filteredProjects.map((p) => (
                    <button
                      key={p.project_id}
                      type="button"
                      onClick={() => handleProjectSelect({ type: 'project', project: p })}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent rounded-sm',
                        selectorValue.type === 'project' && selectorValue.project.project_id === p.project_id && 'bg-accent'
                      )}
                    >
                      <span className="truncate">{p.display_name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">v{p.api_version}</span>
                    </button>
                  ))
                )}
                <button
                  type="button"
                  onClick={() => handleProjectSelect({ type: 'new' })}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent rounded-sm',
                    selectorValue.type === 'new' && 'bg-accent'
                  )}
                >
                  <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                  New project
                </button>
              </div>
            </div>
          )}

          {/* Auth Configs section - only when Auth Configs submenu is highlighted */}
          {showAuthConfigsSection && (
            <div className="flex-1 min-w-0 flex flex-col">
              <button
                type="button"
                onClick={() => {
                  handleAuthSelect(null);
                  setOpen(false);
                }}
                className="px-3 py-2 font-medium text-sm text-left hover:bg-accent rounded-t-md transition-colors flex items-center gap-2 w-full"
              >
                <UserCog className="h-4 w-4" />
                {githubHandle ? `All ${githubHandle}'s auth configs` : 'All Auth Configs'}
              </button>
              <div className="border-b px-2 pb-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={authInputRef}
                    placeholder="Search auth configs..."
                    value={authSearch}
                    onChange={(e) => setAuthSearch(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
              </div>
              <div className="overflow-y-auto max-h-[280px] py-1">
                {isBootstrapping && authConfigs.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground text-center">Loading...</div>
                ) : (
                  filteredAuthConfigs.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleAuthSelect(c.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent rounded-sm',
                        authConfigId === c.id && 'bg-accent'
                      )}
                    >
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
