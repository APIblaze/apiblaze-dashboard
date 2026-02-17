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
  { id: 'api_key', label: 'API Keys' },
  { id: 'auth', label: 'Auth' },
  { id: 'targets', label: 'Targets' },
  { id: 'portal', label: 'Portal' },
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
}: DashboardShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAuthConfigs = pathname === '/dashboard/auth-configs';
  const tab = searchParams.get('tab');
  const isTeamScope = selectorValue.type === 'team';
  const showTeamSubMenu = (isTeamScope || isAuthConfigs) && !projectSubmenu;
  const showProjectSubMenu = !!projectSubmenu;
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      {/* Sticky header: logo + nav */}
      <div className="sticky top-0 z-50 bg-white/95 dark:bg-gray-950/95 backdrop-blur-sm border-b">
        {/* Logo header - avatar aligned with APIBlaze v3.0 */}
        <header className="w-full">
          <div className="w-full px-4 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">APIBlaze v3.0</h1>
                <p className="text-xs text-muted-foreground">Host secure serverless APIs in seconds</p>
              </div>
            </div>
            <UserMenu />
          </div>
        </header>

        {/* Nav + Submenu block - collated together (below logo) */}
        <div className="w-full border-t">
          <div className="w-full px-4 pt-3 pb-2 flex items-center gap-3 flex-wrap">
            {/* Unified nav: Team | Projects | Auth Configs - two distinct dimensions, one dropdown */}
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
              className="min-w-[220px]"
            />
          </div>

          {/* Sub-menu bar - directly below nav, no gap */}
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
      </div>

      {children}
    </div>
  );
}
