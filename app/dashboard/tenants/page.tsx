'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Loader2, Zap, UserCog, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { DashboardShell } from '@/components/dashboard-shell';
import { AuthConfigDetail } from '@/components/auth-configs/auth-config-detail';
import { AppClientDetail } from '@/components/auth-configs/app-client-detail';
import { ProviderDetail } from '@/components/auth-configs/provider-detail';
import { useToast } from '@/hooks/use-toast';

type TenantDetail = {
  tenant_name: string;
  display_name: string;
  auth_config_id: string | null;
  app_clients_count: number;
  proxies: Array<{ project_id: string; api_version: string }>;
};

function TenantsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [tenants, setTenants] = useState<TenantDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tenantToDelete, setTenantToDelete] = useState<TenantDetail | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  const authConfigId = searchParams.get('authConfig');
  const clientId = searchParams.get('client');
  const providerId = searchParams.get('provider');

  const user = session?.user as { id?: string } | undefined;
  const teamId = user?.id ? `team_${user.id}` : undefined;

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      const returnPath = typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : '/dashboard/tenants';
      router.push(`/auth/login?returnUrl=${encodeURIComponent(returnPath)}`);
    }
  }, [status, router]);

  useEffect(() => {
    if (!teamId || authConfigId) return;
    (async () => {
      try {
        setLoading(true);
        const res = await api.getTeamTenants(teamId, true);
        if (Array.isArray(res.tenants) && res.tenants.length > 0 && typeof res.tenants[0] === 'object') {
          setTenants(res.tenants as TenantDetail[]);
        } else {
          setTenants([]);
        }
      } catch {
        setTenants([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [teamId, authConfigId]);

  const handleManage = (tenant: TenantDetail) => {
    if (tenant.auth_config_id) {
      router.push(`/dashboard/tenants?authConfig=${encodeURIComponent(tenant.auth_config_id)}`);
    } else {
      toast({
        title: 'No auth config',
        description: 'This tenant has no auth config yet. Attach it to a project and configure auth from the project\'s Authentication tab.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteClick = (tenant: TenantDetail) => {
    if (tenant.tenant_name === 'api') return;
    setTenantToDelete(tenant);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!tenantToDelete || tenantToDelete.tenant_name === 'api') return;
    // Deleting a tenant requires removing it from all proxies - for now we show a message
    toast({
      title: 'Not implemented',
      description: 'Tenant deletion will detach the tenant from all projects. This feature is coming soon.',
      variant: 'destructive',
    });
    setDeleteDialogOpen(false);
    setTenantToDelete(null);
  };

  const handleBack = () => {
    if (providerId && clientId && authConfigId) {
      router.push(`/dashboard/tenants?authConfig=${authConfigId}&client=${clientId}`);
    } else if (clientId && authConfigId) {
      router.push(`/dashboard/tenants?authConfig=${authConfigId}`);
    } else if (authConfigId) {
      router.push('/dashboard/tenants');
    } else {
      router.push('/dashboard');
    }
  };

  if (status === 'loading' || !mounted) {
    return null;
  }

  // Drill-down: auth config / app client / provider detail
  if (providerId && clientId && authConfigId) {
    return (
      <DashboardShell
        selectorValue={{ type: 'team' }}
        onSelectorChange={() => {}}
        githubHandle={(session?.user as { githubHandle?: string })?.githubHandle}
        teamId={teamId}
        userId={user?.id}
        authConfigsSubmenu={{ authConfigId, clientId, providerId }}
      >
        <main className="w-full px-4 py-8">
          <div className="container mx-auto max-w-6xl">
            <ProviderDetail
              authConfigId={authConfigId}
              clientId={clientId}
              providerId={providerId}
              onBack={handleBack}
            />
          </div>
        </main>
      </DashboardShell>
    );
  }
  if (clientId && authConfigId) {
    return (
      <DashboardShell
        selectorValue={{ type: 'team' }}
        onSelectorChange={() => {}}
        githubHandle={(session?.user as { githubHandle?: string })?.githubHandle}
        teamId={teamId}
        userId={user?.id}
        authConfigsSubmenu={{ authConfigId, clientId }}
      >
        <main className="w-full px-4 py-8">
          <div className="container mx-auto max-w-6xl">
            <AppClientDetail
              authConfigId={authConfigId}
              clientId={clientId}
              teamId={teamId ?? undefined}
              onBack={handleBack}
              verifyFromUrl={searchParams.get('verify') === '1'}
            />
          </div>
        </main>
      </DashboardShell>
    );
  }
  if (authConfigId) {
    return (
      <DashboardShell
        selectorValue={{ type: 'team' }}
        onSelectorChange={() => {}}
        githubHandle={(session?.user as { githubHandle?: string })?.githubHandle}
        teamId={teamId}
        userId={user?.id}
        authConfigsSubmenu={{ authConfigId }}
      >
        <main className="w-full px-4 py-8">
          <div className="container mx-auto max-w-6xl">
            <AuthConfigDetail
              authConfigId={authConfigId}
              teamId={teamId ?? undefined}
              onBack={handleBack}
            />
          </div>
        </main>
      </DashboardShell>
    );
  }

  // Tenant list view
  return (
    <DashboardShell
      selectorValue={{ type: 'team' }}
      onSelectorChange={() => {}}
      githubHandle={(session?.user as { githubHandle?: string })?.githubHandle}
      teamId={teamId}
      userId={user?.id}
    >
      <main className="w-full px-4 py-8">
        <div className="container mx-auto max-w-6xl">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Tenants</h2>
              <p className="text-muted-foreground mt-1">
                Manage your auth configs, app clients, and authentication providers
              </p>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : tenants.length === 0 ? (
              <Card className="border-2 border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <UserCog className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">No tenants yet</p>
                  <p className="text-sm text-muted-foreground text-center mt-1">
                    Add a tenant from a project&apos;s Authentication tab
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {tenants.map((tenant) => (
                  <Card key={tenant.tenant_name}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">{tenant.display_name}</CardTitle>
                      <CardDescription className="font-mono text-xs">
                        {tenant.tenant_name}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {tenant.app_clients_count} App Client{tenant.app_clients_count !== 1 ? 's' : ''}
                      </p>
                      {tenant.proxies.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Proxies: {tenant.proxies.map((p) => `${p.project_id}/${p.api_version}`).join(', ')}
                        </p>
                      )}
                    </CardContent>
                    <div className="flex gap-2 px-6 pb-6">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleManage(tenant)}
                      >
                        Manage
                      </Button>
                      {tenant.tenant_name !== 'api' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDeleteClick(tenant)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete tenant</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{tenantToDelete?.display_name}&quot;? This will remove the tenant from all projects. The tenant&apos;s auth config and app clients will also be removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}

export default function TenantsPage() {
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
                  <p className="text-xs text-muted-foreground">Tenants</p>
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
      <TenantsContent />
    </Suspense>
  );
}
