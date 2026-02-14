'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Pencil, Trash2, Copy, Check, Star, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useDashboardCacheStore } from '@/store/dashboard-cache';
import type { AppClient } from '@/types/auth-config';
import { ProviderList } from './provider-list';
import { UsersList } from './users-list';
import { GroupsList } from './groups-list';
import { AppClientFormDialog } from './app-client-form-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface AppClientDetailProps {
  authConfigId: string;
  clientId: string;
  onBack: () => void;
  verifyFromUrl?: boolean;
}

export function AppClientDetail({ authConfigId, clientId, onBack, verifyFromUrl }: AppClientDetailProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const getAppClient = useDashboardCacheStore((s) => s.getAppClient);
  const getAuthConfig = useDashboardCacheStore((s) => s.getAuthConfig);
  const invalidateAndRefetch = useDashboardCacheStore((s) => s.invalidateAndRefetch);
  const updateAppClientInCache = useDashboardCacheStore((s) => s.updateAppClientInCache);
  const authConfig = getAuthConfig(authConfigId) ?? null;
  const appClient = getAppClient(authConfigId, clientId) as AppClient | undefined ?? null;
  const loading = useDashboardCacheStore((s) => s.isBootstrapping);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [loadingReveal, setLoadingReveal] = useState(false);
  const [justVerified, setJustVerified] = useState(false);
  const autoVerifyAttempted = useRef(false);

  // Auto-verify when landing from unverified error page link
  useEffect(() => {
    if (!verifyFromUrl || !appClient || appClient.verified !== false || autoVerifyAttempted.current || loading) return;
    autoVerifyAttempted.current = true;
    (async () => {
      try {
        await api.updateAppClient(authConfigId, appClient.id, { verified: true });
        updateAppClientInCache(authConfigId, appClient.id, { verified: true });
        setJustVerified(true);
        toast({
          title: 'App verified',
          description: 'This app client has been verified. Users can now sign in.',
        });
        // Remove verify param from URL
        const params = new URLSearchParams(searchParams.toString());
        params.delete('verify');
        const qs = params.toString();
        router.replace(qs ? `/dashboard/auth-configs?${qs}` : '/dashboard/auth-configs', { scroll: false });
      } catch (error) {
        autoVerifyAttempted.current = false;
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to verify app client',
          variant: 'destructive',
        });
      }
    })();
  }, [verifyFromUrl, appClient, loading, authConfigId, updateAppClientInCache, toast, router, searchParams]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        title: 'Copied',
        description: 'Copied to clipboard',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      toast({
        title: 'Error',
        description: 'Failed to copy to clipboard. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleRevealSecret = async () => {
    try {
      setLoadingReveal(true);
      const { clientSecret } = await api.getAppClientSecret(authConfigId, clientId);
      setRevealedSecret(clientSecret);
      toast({
        title: 'Secret revealed',
        description: 'Copy and store it securely. It will not be shown again until you click Reveal.',
      });
    } catch (error) {
      console.error('Failed to reveal client secret:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to retrieve client secret',
        variant: 'destructive',
      });
    } finally {
      setLoadingReveal(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!appClient) return;

    try {
      setDeleting(true);
      await api.deleteAppClient(authConfigId, appClient.id);
      await invalidateAndRefetch();
      toast({
        title: 'Success',
        description: 'App client deleted successfully',
      });
      router.push(`/dashboard/auth-configs?authConfig=${authConfigId}`);
    } catch (error) {
      console.error('Error deleting app client:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete app client',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleSuccess = async () => {
    setEditDialogOpen(false);
    await invalidateAndRefetch();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!appClient) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">App client not found</p>
          <Button variant="outline" onClick={onBack} className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {justVerified && (
          <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/50 p-4 text-sm text-green-800 dark:text-green-200">
            <strong>App verified successfully.</strong> This app client is now verified. Users can sign in.
          </div>
        )}
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-bold">{appClient.name}</h2>
              <div className="flex items-center gap-1.5">
                {authConfig?.default_app_client_id === appClient.id && (
                  <Badge variant="default" className="bg-yellow-500 hover:bg-yellow-600 text-xs">
                    <Star className="h-3 w-3 mr-1" />
                    Default
                  </Badge>
                )}
                {appClient.verified === false && (
                  <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-xs">
                    Unverified
                  </Badge>
                )}
                {appClient.verified === true && (
                  <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 text-xs">
                    Verified
                  </Badge>
                )}
              </div>
            </div>
            <p className="text-muted-foreground font-mono text-sm">{appClient.id}</p>
          </div>
          <div className="flex items-center gap-2">
            {appClient.verified === false && (
              <Button
                variant="default"
                onClick={async () => {
                  try {
                    await api.updateAppClient(authConfigId, appClient.id, { verified: true });
                    updateAppClientInCache(authConfigId, appClient.id, { verified: true });
                    toast({
                      title: 'Success',
                      description: 'App client verified successfully',
                    });
                  } catch (error) {
                    console.error('Failed to verify app client:', error);
                    toast({
                      title: 'Error',
                      description: error instanceof Error ? error.message : 'Failed to verify app client',
                      variant: 'destructive',
                    });
                  }
                }}
              >
                Verify
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>

        {/* Client Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Client ID</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono break-all">{appClient.clientId}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(appClient.clientId)}
                >
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Client Secret</CardTitle>
              <CardDescription>Reveal only when needed. Never share or log.</CardDescription>
            </CardHeader>
            <CardContent>
              {revealedSecret !== null ? (
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono break-all bg-muted px-2 py-1 rounded">
                    {revealedSecret}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(revealedSecret)}
                  >
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRevealSecret}
                  disabled={loadingReveal}
                >
                  {loadingReveal ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Eye className="h-4 w-4 mr-2" />
                  )}
                  {loadingReveal ? 'Loading...' : 'Reveal'}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Token Expiry Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Refresh Token:</span>
                <span>
                  {typeof appClient.refreshTokenExpiry === 'number'
                    ? `${Math.floor(appClient.refreshTokenExpiry / 86400)} days`
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">ID Token:</span>
                <span>
                  {typeof appClient.idTokenExpiry === 'number'
                    ? `${Math.floor(appClient.idTokenExpiry / 60)} minutes`
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Access Token:</span>
                <span>
                  {typeof appClient.accessTokenExpiry === 'number'
                    ? `${Math.floor(appClient.accessTokenExpiry / 60)} minutes`
                    : '—'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Authorized Callback URLs */}
        {appClient.authorizedCallbackUrls && appClient.authorizedCallbackUrls.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Authorized Callback URLs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {appClient.authorizedCallbackUrls.map((uri, index) => (
                  <div key={uri} className="flex items-center gap-1">
                    {index === 0 && (
                      <Badge variant="secondary" className="text-xs mr-1">
                        <Star className="h-2 w-2 mr-1" />
                        Default
                      </Badge>
                    )}
                    <Badge variant="outline" className="font-mono text-xs">
                      {uri}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Signout URIs */}
        {appClient.signoutUris && appClient.signoutUris.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Signout URIs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {appClient.signoutUris.map((uri) => (
                  <Badge key={uri} variant="outline" className="font-mono text-xs">
                    {uri}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Scopes */}
        {appClient.scopes && appClient.scopes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Scopes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {appClient.scopes.map((scope) => (
                  <Badge key={scope} variant="secondary">
                    {scope}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Providers Section */}
        <div>
          <ProviderList authConfigId={authConfigId} clientId={clientId} onRefresh={() => invalidateAndRefetch()} />
        </div>

        {/* Users Section (per app client) */}
        <div>
          <UsersList authConfigId={authConfigId} clientId={clientId} onRefresh={() => invalidateAndRefetch()} />
        </div>

        {/* Groups Section (per app client) */}
        <div>
          <GroupsList authConfigId={authConfigId} clientId={clientId} onRefresh={() => invalidateAndRefetch()} />
        </div>
      </div>

      {/* Edit Dialog */}
      <AppClientFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={handleSuccess}
        authConfigId={authConfigId}
        appClient={appClient}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete App Client?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the app client
              {appClient && ` "${appClient.name}"`} and all associated providers, users, and groups.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}














