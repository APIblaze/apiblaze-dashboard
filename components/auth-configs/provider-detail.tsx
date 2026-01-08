'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Settings, Trash2, Copy, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
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
  const [provider, setProvider] = useState<SocialProvider | null>(null);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchProvider();
  }, [authConfigId, clientId, providerId]);

  const fetchProvider = async () => {
    try {
      setLoading(true);
      const providers = await api.listProviders(authConfigId, clientId);
      const found = providers.find((p) => p.id === providerId);
      if (found) {
        setProvider(found);
      } else {
        toast({
          title: 'Error',
          description: 'Provider not found',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error fetching provider:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load provider',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

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

  const handleSuccess = () => {
    setEditDialogOpen(false);
    fetchProvider();
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
                <code className="flex-1 text-sm font-mono break-all">{provider.clientId}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(provider.clientId)}
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
              <CardTitle className="text-sm font-medium">Token Type</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="secondary">
                {provider.tokenType === 'apiblaze' ? 'APIBlaze' : 'Third Party'}
              </Badge>
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














