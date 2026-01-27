'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Settings, Trash2, MoreVertical, ExternalLink } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useDashboardCacheStore } from '@/store/dashboard-cache';
import type { SocialProvider } from '@/types/auth-config';
import { ProviderFormDialog } from './provider-form-dialog';

interface ProviderListProps {
  authConfigId: string;
  clientId: string;
  onRefresh?: () => void;
}

const PROVIDER_TYPE_LABELS: Record<SocialProvider['type'], string> = {
  google: 'Google',
  github: 'GitHub',
  microsoft: 'Microsoft',
  facebook: 'Facebook',
  auth0: 'Auth0',
  other: 'Other',
};

export function ProviderList({ authConfigId, clientId, onRefresh }: ProviderListProps) {
  const router = useRouter();
  const { toast } = useToast();
  const getProviders = useDashboardCacheStore((s) => s.getProviders);
  const invalidateAndRefetch = useDashboardCacheStore((s) => s.invalidateAndRefetch);
  const providers = getProviders(authConfigId, clientId);
  const loading = useDashboardCacheStore((s) => s.isBootstrapping);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<SocialProvider | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleCreate = () => {
    setSelectedProvider(null);
    setCreateDialogOpen(true);
  };

  const handleEdit = (provider: SocialProvider) => {
    setSelectedProvider(provider);
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (provider: SocialProvider) => {
    setSelectedProvider(provider);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedProvider) return;

    try {
      setDeleting(true);
      await api.removeProvider(authConfigId, clientId, selectedProvider.id);
      await invalidateAndRefetch();
      toast({
        title: 'Success',
        description: 'Provider deleted successfully',
      });
      setDeleteDialogOpen(false);
      setSelectedProvider(null);
      onRefresh?.();
    } catch (error) {
      console.error('Error deleting provider:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete provider',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleViewDetails = (provider: SocialProvider) => {
    router.push(`/dashboard/auth-configs?authConfig=${authConfigId}&client=${clientId}&provider=${provider.id}`);
  };

  const handleSuccess = async () => {
    setCreateDialogOpen(false);
    setEditDialogOpen(false);
    setSelectedProvider(null);
    await invalidateAndRefetch();
    onRefresh?.();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Social Providers</h3>
            <p className="text-muted-foreground text-sm mt-1">
              Manage OAuth providers for this app client
            </p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Provider
          </Button>
        </div>

        {/* Providers Grid */}
        {providers.length === 0 ? (
          <Card className="border-2 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Settings className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No providers yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Add a social provider to enable OAuth authentication
              </p>
              <Button onClick={handleCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Add Provider
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {providers.map((provider) => (
              <Card key={provider.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg mb-1">
                        {PROVIDER_TYPE_LABELS[provider.type]}
                      </CardTitle>
                      <CardDescription className="font-mono text-xs break-all">
                        {provider.clientId.substring(0, 30)}...
                      </CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleViewDetails(provider)}>
                          <ExternalLink className="mr-2 h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEdit(provider)}>
                          <Settings className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDeleteClick(provider)}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Token Type:</span>
                    <Badge variant="secondary">
                      {provider.tokenType === 'apiblaze' ? 'APIBlaze' : 'Third Party'}
                    </Badge>
                  </div>
                  {provider.domain && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Domain:</span>
                      <span className="font-mono text-xs">{provider.domain}</span>
                    </div>
                  )}
                </CardContent>
                <CardFooter>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleViewDetails(provider)}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View Details
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <ProviderFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleSuccess}
        authConfigId={authConfigId}
        clientId={clientId}
      />

      {/* Edit Dialog */}
      <ProviderFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={handleSuccess}
        authConfigId={authConfigId}
        clientId={clientId}
        provider={selectedProvider}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Provider?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the provider
              {selectedProvider && ` "${PROVIDER_TYPE_LABELS[selectedProvider.type]}"`}.
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














