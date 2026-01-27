'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useDashboardCacheStore } from '@/store/dashboard-cache';

/**
 * Runs bootstrap when cache is empty and user is authenticated.
 * Wraps dashboard routes only. Safe to mount multiple times (e.g. layout + page);
 * we skip if already bootstrapping or cache has data.
 */
export function DashboardCacheProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const { projects, isBootstrapping, fetchBootstrap } = useDashboardCacheStore();
  const hasBootstrapped = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated' || isBootstrapping) return;
    if (projects.length > 0 || hasBootstrapped.current) return;

    const teamId = session?.user?.githubHandle
      ? `team_${(session.user as { githubHandle?: string }).githubHandle}`
      : undefined;

    hasBootstrapped.current = true;
    fetchBootstrap(teamId).catch(() => {
      hasBootstrapped.current = false;
    });
  }, [status, session?.user, isBootstrapping, projects.length, fetchBootstrap]);

  return <>{children}</>;
}
