'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Zap } from 'lucide-react';
import { UnifiedNav } from '@/components/unified-nav';
import { UserMenu } from '@/components/user-menu';
import type { ProjectSelectorValue } from '@/components/project-selector';
import { cn } from '@/lib/utils';

const PROJECT_MENU_ITEMS = [
  { id: 'general', label: 'General' },
  { id: 'auth', label: 'Auth' },
  { id: 'targets', label: 'Targets' },
  { id: 'throttling', label: 'Throttling' },
  { id: 'routes', label: 'Routes' },
  { id: 'preprocessing', label: 'Processing' },
  { id: 'domains', label: 'Domains' },
] as const;

export type ProjectConfigTab = (typeof PROJECT_MENU_ITEMS)[number]['id'];

interface DashboardShellProps {
  children: React.ReactNode;
  selectorValue: ProjectSelectorValue;
  onSelectorChange: (value: ProjectSelectorValue) => void;
  githubHandle?: string | null;
  teamId?: string;
  userId?: string | null;
  /** When in project scope: active tab and handler for project config submenu */
  projectSubmenu?: { activeTab: ProjectConfigTab; onTabChange: (tab: ProjectConfigTab) => void };
  /** When on auth-configs page: drill-down context to show Auth Config > App Client > Provider in nav */
  authConfigsSubmenu?: { authConfigId?: string | null; clientId?: string | null; providerId?: string | null };
  /** When false (zero state, no projects): hide nav menu and submenu */
  hasProjects?: boolean;
}

export function DashboardShell({
  children,
  selectorValue,
  onSelectorChange,
  githubHandle,
  teamId,
  userId,
  projectSubmenu,
  authConfigsSubmenu,
  hasProjects = true,
}: DashboardShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAuthConfigs = pathname === '/dashboard/auth-configs';
  const tab = searchParams.get('tab');
  const isTeamScope = selectorValue.type === 'team';
  const showNavAndSubmenu = hasProjects;
  const showTeamSubMenu = showNavAndSubmenu && (isTeamScope || isAuthConfigs) && !projectSubmenu;
  const showProjectSubMenu = !!projectSubmenu;
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      {/* Sticky header: logo + nav */}
      <div className="sticky top-0 z-50 bg-white/95 dark:bg-gray-950/95 backdrop-blur-sm border-b">
        {/* Header: [APIblaze icon + name] [project selector ▾] ———————— [avatar] */}
        <header className="w-full">
          <div className="w-full px-4 py-3 flex items-center gap-4">
            <Link
              href="/dashboard"
              onClick={() => onSelectorChange({ type: 'team' })}
              className="flex items-center gap-2 shrink-0 hover:opacity-90 transition-opacity"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="text-base font-semibold tracking-tight">APIblaze</span>
            </Link>
            {showNavAndSubmenu && (
              <UnifiedNav
                selectorValue={selectorValue}
                onSelectorChange={onSelectorChange}
                githubHandle={githubHandle}
                teamId={teamId}
                userId={userId}
                authConfigId={authConfigsSubmenu?.authConfigId ?? undefined}
                clientId={authConfigsSubmenu?.clientId ?? undefined}
                providerId={authConfigsSubmenu?.providerId ?? undefined}
                showProjectsSection={!isAuthConfigs}
                showAuthConfigsSection={isAuthConfigs}
                className="min-w-[180px] shrink-0"
              />
            )}
            <div className="flex-1 min-w-0" />
            <UserMenu />
          </div>
        </header>

        {/* Submenu block - below logo. Hidden in zero state (no projects). */}
        {showNavAndSubmenu && (
        <div className="w-full border-t">
          {/* Sub-menu bar - directly below header */}
          {showTeamSubMenu && (
      <nav className="w-full bg-white dark:bg-gray-950 px-4 pt-0">
        <div className="w-full">
          <div className="flex items-center gap-1 py-2 flex-wrap">
            <Link
              href="/dashboard"
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-md transition-colors',
                !isAuthConfigs && !tab
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              Projects
            </Link>
            <Link
              href="/dashboard/auth-configs"
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-md transition-colors',
                isAuthConfigs
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              Auth Configs
            </Link>
            <Link
              href="/dashboard?tab=settings"
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-md transition-colors',
                !isAuthConfigs && tab === 'settings'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              Settings
            </Link>
            <Link
              href="/dashboard?tab=developers"
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-md transition-colors',
                !isAuthConfigs && tab === 'developers'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              Developers
            </Link>
            <Link
              href="/dashboard?tab=profile"
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-md transition-colors',
                !isAuthConfigs && tab === 'profile'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              Profile
            </Link>
          </div>
        </div>
      </nav>
      )}
          {showProjectSubMenu && projectSubmenu && (
      <nav className="w-full bg-white dark:bg-gray-950 px-4 pt-0">
        <div className="w-full">
          <div className="flex items-center gap-1 py-2">
            {PROJECT_MENU_ITEMS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => projectSubmenu.onTabChange(id)}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-md transition-colors',
                  projectSubmenu.activeTab === id
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </nav>
        )}
        </div>
        )}
      </div>

      {children}
    </div>
  );
}
