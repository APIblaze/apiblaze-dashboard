'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthConfigList } from '@/components/auth-configs/auth-config-list';
import { AuthConfigDetail } from '@/components/auth-configs/auth-config-detail';
import { AppClientDetail } from '@/components/auth-configs/app-client-detail';
import { ProviderDetail } from '@/components/auth-configs/provider-detail';
import { DashboardShell } from '@/components/dashboard-shell';
import { useDashboardCacheStore } from '@/store/dashboard-cache';
import { api } from '@/lib/api';

function AuthConfigsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [mounted, setMounted] = useState(false);
  const [lookupAuthConfigId, setLookupAuthConfigId] = useState<string | null>(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  const lookupInProgressRef = useRef<string | null>(null);
  const getAppClientWithAuthConfig = useDashboardCacheStore((s) => s.getAppClientWithAuthConfig);
  const setAppClientsForConfig = useDashboardCacheStore((s) => s.setAppClientsForConfig);
  const loading = useDashboardCacheStore((s) => s.isBootstrapping);

  const authConfigIdFromUrl = searchParams.get('authConfig');
  const clientId = searchParams.get('client');
  const providerId = searchParams.get('provider');
  const verify = searchParams.get('verify');

  // Resolve authConfigId: URL > cache > lookup result
  const authConfigId =
    authConfigIdFromUrl ??
    (clientId ? getAppClientWithAuthConfig(clientId)?.authConfigId : null) ??
    lookupAuthConfigId ??
    null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      const returnPath = typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : '/dashboard/auth-configs';
      router.push(`/auth/login?returnUrl=${encodeURIComponent(returnPath)}`);
    }
  }, [status, router]);

  // When clientId in URL but not in cache, try direct lookup (e.g. verify link, newly registered client).
  // Run lookup immediately—don't wait for bootstrap. Lookup is a single fast request; bootstrap does 30+.
  useEffect(() => {
    if (!clientId || authConfigIdFromUrl || lookupAuthConfigId || lookupFailed) return;
    // If bootstrap is done and we have the client in cache, use it (no lookup needed)
    if (!loading) {
      const fromCache = useDashboardCacheStore.getState().getAppClientWithAuthConfig(clientId);
      if (fromCache) return;
    }
    // Avoid duplicate lookups when effect re-runs before first completes
    if (lookupInProgressRef.current === clientId) return;

    let cancelled = false;
    lookupInProgressRef.current = clientId;
    setLookupFailed(false);
    (async () => {
      try {
        const res = await api.lookupAppClient(clientId);
        if (cancelled) return;
        setLookupAuthConfigId(res.authConfigId);
        setAppClientsForConfig(res.authConfigId, [res.client]);
        router.replace(
          `/dashboard/auth-configs?authConfig=${encodeURIComponent(res.authConfigId)}&client=${encodeURIComponent(clientId)}${verify === '1' ? '&verify=1' : ''}`,
          { scroll: false }
        );
      } catch {
        if (!cancelled) {
          setLookupAuthConfigId(null);
          setLookupFailed(true);
        }
      } finally {
        lookupInProgressRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, loading, authConfigIdFromUrl, lookupAuthConfigId, lookupFailed, verify, router, setAppClientsForConfig]); // loading: re-check cache when bootstrap completes

  if (status === 'loading' || !mounted) {
    return null;
  }

  const handleBack = () => {
    if (providerId && clientId && authConfigId) {
      router.push(`/dashboard/auth-configs?authConfig=${authConfigId}&client=${clientId}`);
    } else if (clientId && authConfigId) {
      router.push(`/dashboard/auth-configs?authConfig=${authConfigId}`);
    } else if (authConfigId) {
      router.push('/dashboard/auth-configs');
    } else {
      router.push('/dashboard');
    }
  };

  const user = session?.user as { githubHandle?: string | null; id?: string } | undefined;
  const teamId = user?.id ? `team_${user.id}` : undefined;

  return (
    <DashboardShell
      selectorValue={{ type: 'team' }}
      onSelectorChange={() => {}}
      githubHandle={user?.githubHandle}
      teamId={teamId}
      userId={user?.id}
      authConfigsSubmenu={{ authConfigId: authConfigId ?? undefined, clientId: clientId ?? undefined, providerId: providerId ?? undefined }}
    >
      <main className="w-full px-4 py-8">
        <div className="container mx-auto max-w-6xl">
          {/* Conditional Rendering based on URL params */}
          {providerId && clientId && authConfigId ? (
            <ProviderDetail
              authConfigId={authConfigId}
              clientId={clientId}
              providerId={providerId}
              onBack={handleBack}
            />
          ) : clientId && authConfigId ? (
            <AppClientDetail
              authConfigId={authConfigId}
              clientId={clientId}
              teamId={teamId}
              onBack={handleBack}
              verifyFromUrl={verify === '1'}
            />
          ) : clientId && !authConfigId && lookupFailed ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <p className="text-muted-foreground">App client not found</p>
              <Button variant="outline" asChild>
                <a href="/dashboard/auth-configs">Back to Auth Configs</a>
              </Button>
            </div>
          ) : clientId && !authConfigId ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : authConfigId ? (
            <AuthConfigDetail
              authConfigId={authConfigId}
              teamId={teamId}
              onBack={handleBack}
            />
          ) : (
            <AuthConfigList />
          )}
        </div>
      </main>
    </DashboardShell>
  );
}

export default function AuthConfigsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
          <header className="border-b bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
            <div className="container mx-auto px-4 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">APIBlaze v3.0</h1>
                  <p className="text-xs text-muted-foreground">Auth Configs Management</p>
                </div>
              </div>
            </div>
          </header>
          <main className="container mx-auto px-4 py-8">
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </main>
        </div>
      }
    >
      <AuthConfigsContent />
    </Suspense>
  );
}

