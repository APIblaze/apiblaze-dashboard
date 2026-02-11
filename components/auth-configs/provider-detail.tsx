'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Settings, Trash2, Copy, Check, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useDashboardCacheStore } from '@/store/dashboard-cache';
import type { SocialProvider } from '@/types/auth-config';
import { ProviderFormDialog } from './provider-form-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ProviderDetailProps {
  authConfigId: string;
  clientId: string;
  providerId: string;
  onBack: () => void;
}

const PROVIDER_TYPE_LABELS: Record<SocialProvider['type'], string> = {
  google: 'Google',
  github: 'GitHub',
  microsoft: 'Microsoft',
  facebook: 'Facebook',
  auth0: 'Auth0',
  other: 'Other',
};

export function ProviderDetail({ authConfigId, clientId, providerId, onBack }: ProviderDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const getProviders = useDashboardCacheStore((s) => s.getProviders);
  const invalidateAndRefetch = useDashboardCacheStore((s) => s.invalidateAndRefetch);
  const providers = getProviders(authConfigId, clientId);
  const provider = providers.find((p) => p.id === providerId) ?? null;
  const loading = useDashboardCacheStore((s) => s.isBootstrapping);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [loadingReveal, setLoadingReveal] = useState(false);

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

  const handleDeleteConfirm = async () => {
    if (!provider) return;

    try {
      setDeleting(true);
      await api.removeProvider(authConfigId, clientId, provider.id);
      await invalidateAndRefetch();
      toast({
        title: 'Success',
        description: 'Provider deleted successfully',
      });
      router.push(`/dashboard/auth-configs?authConfig=${authConfigId}&client=${clientId}`);
    } catch (error) {
      console.error('Error deleting provider:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete provider',
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

  const handleRevealSecret = async () => {
    try {
      setLoadingReveal(true);
      const { clientSecret } = await api.getProviderSecret(authConfigId, clientId, providerId);
      setRevealedSecret(clientSecret);
      toast({
        title: 'Secret revealed',
        description: 'Copy and store it securely. It will not be shown again until you click Reveal.',
      });
    } catch (error) {
      console.error('Failed to reveal provider secret:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to retrieve provider secret',
        variant: 'destructive',
      });
    } finally {
      setLoadingReveal(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!provider) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Provider not found</p>
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">{PROVIDER_TYPE_LABELS[provider.type]}</h2>
            <p className="text-muted-foreground mt-1 font-mono text-sm">{provider.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
              <Settings className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>

        {/* Provider Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Client ID</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono break-all">{provider.clientId ?? (provider as { client_id?: string }).client_id ?? ''}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(provider.clientId ?? (provider as { client_id?: string }).client_id ?? '')}
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
              <CardTitle className="text-sm font-medium">Client side token type</CardTitle>
              <CardDescription>
                {(provider.tokenType ?? (provider as { token_type?: string }).token_type) === 'thirdParty'
                  ? 'Tokens the API users will see and that will be forwarded to your target servers'
                  : 'Tokens the API users will see'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="secondary">
                {(provider.tokenType ?? (provider as { token_type?: string }).token_type) === 'apiblaze' ? 'API Blaze token' : 'Third Party'}
              </Badge>
            </CardContent>
          </Card>

          {(provider.tokenType ?? (provider as { token_type?: string }).token_type) !== 'thirdParty' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Target server token type</CardTitle>
              <CardDescription>What to send in the Authorization header when forwarding to your target servers</CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="secondary">
                {(() => {
                  const v = provider.targetServerToken ?? (provider as { target_server_token?: string }).target_server_token ?? 'apiblaze';
                  const providerLabel = PROVIDER_TYPE_LABELS[provider.type];
                  if (v === 'third_party_access_token') return `${providerLabel} access token`;
                  if (v === 'third_party_id_token') return `${providerLabel} ID token`;
                  if (v === 'none') return 'None';
                  return 'APIBlaze';
                })()}
              </Badge>
              {(provider.targetServerToken ?? (provider as { target_server_token?: string }).target_server_token) === 'third_party_access_token' ||
               (provider.targetServerToken ?? (provider as { target_server_token?: string }).target_server_token) === 'third_party_id_token' ? (
                <p className="text-xs text-muted-foreground mt-2 space-y-1">
                  Include APIBlaze access token in x-apiblaze-access-token: {(provider.includeApiblazeAccessTokenHeader ?? (provider as { include_apiblaze_access_token_header?: boolean }).include_apiblaze_access_token_header ?? (provider as { include_apiblaze_token_header?: boolean }).include_apiblaze_token_header) ? 'Yes' : 'No'}<br />
                  Include APIBlaze ID token in x-apiblaze-id-token: {(provider.includeApiblazeIdTokenHeader ?? (provider as { include_apiblaze_id_token_header?: boolean }).include_apiblaze_id_token_header) ? 'Yes' : 'No'}
                </p>
              ) : null}
            </CardContent>
          </Card>
          )}

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
        </div>

        {provider.domain && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Domain</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono break-all">{provider.domain}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(provider.domain || '')}
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
        )}
      </div>

      {/* Edit Dialog */}
      <ProviderFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={handleSuccess}
        authConfigId={authConfigId}
        clientId={clientId}
        provider={provider}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Provider?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the provider
              {provider && ` "${PROVIDER_TYPE_LABELS[provider.type]}"`}.
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














