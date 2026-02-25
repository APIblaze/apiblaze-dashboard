'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Key, Trash2, MoreVertical, ExternalLink, Star, Pencil } from 'lucide-react';
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
import type { AppClient } from '@/types/auth-config';
import { AppClientFormDialog } from './app-client-form-dialog';

interface AppClientListProps {
  authConfigId: string;
  teamId?: string;
  onRefresh?: () => void;
}

export function AppClientList({ authConfigId, teamId, onRefresh }: AppClientListProps) {
  const router = useRouter();
  const { toast } = useToast();
  const getAppClients = useDashboardCacheStore((s) => s.getAppClients);
  const getAuthConfig = useDashboardCacheStore((s) => s.getAuthConfig);
  const invalidateAndRefetch = useDashboardCacheStore((s) => s.invalidateAndRefetch);
  const fetchAppClientsForConfig = useDashboardCacheStore((s) => s.fetchAppClientsForConfig);
  const appClientsByConfig = useDashboardCacheStore((s) => s.appClientsByConfig);
  const appClients = getAppClients(authConfigId);
  const authConfig = getAuthConfig(authConfigId) ?? null;
  const bootstrapLoading = useDashboardCacheStore((s) => s.isBootstrapping);
  const clientsLoaded = authConfigId in appClientsByConfig;
  const loading = bootstrapLoading || !clientsLoaded;

  useEffect(() => {
    if (!bootstrapLoading && authConfigId) {
      fetchAppClientsForConfig(authConfigId);
    }
  }, [authConfigId, bootstrapLoading, fetchAppClientsForConfig]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<AppClient | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleCreate = () => {
    setSelectedClient(null);
    setCreateDialogOpen(true);
  };

  const handleEdit = (client: AppClient) => {
    setSelectedClient(client);
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (client: AppClient) => {
    setSelectedClient(client);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedClient) return;

    try {
      setDeleting(true);
      await api.deleteAppClient(authConfigId, selectedClient.id);
      toast({
        title: 'Success',
        description: 'App client deleted successfully',
      });
      setDeleteDialogOpen(false);
      setSelectedClient(null);
      await invalidateAndRefetch();
      onRefresh?.();
    } catch (error) {
      console.error('Error deleting app client:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete app client',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleViewDetails = (client: AppClient) => {
    router.push(`/dashboard/auth-configs?authConfig=${authConfigId}&client=${client.id}`);
  };

  const handleSuccess = async () => {
    setCreateDialogOpen(false);
    setEditDialogOpen(false);
    setSelectedClient(null);
    await invalidateAndRefetch();
    onRefresh?.();
  };

  // Removed handleSetDefault - default app client is now stored in project config, not in auth config table
  // const handleSetDefault = async (client: AppClient) => { ... }

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
            <h3 className="text-lg font-semibold">App Clients</h3>
            <p className="text-muted-foreground text-sm mt-1">
              Manage OAuth app clients for this auth config
            </p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add App Client
          </Button>
        </div>

        {/* App Clients Grid */}
        {appClients.length === 0 ? (
          <Card className="border-2 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Key className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No app clients yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create an app client to configure OAuth authentication
              </p>
              <Button onClick={handleCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Create App Client
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {appClients.map((client) => {
              const isDefault = authConfig?.default_app_client_id === client.id;
              return (
                <Card key={client.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <CardTitle className="text-lg">{client.name}</CardTitle>
                          <div className="flex items-center gap-1.5">
                            {isDefault && (
                              <Badge variant="default" className="bg-yellow-500 hover:bg-yellow-600 text-xs">
                                <Star className="h-3 w-3 mr-1" />
                                Default
                              </Badge>
                            )}
                            {client.verified === false && (
                              <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-xs">
                                Unverified
                              </Badge>
                            )}
                            {client.verified === true && (
                              <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 text-xs">
                                Verified
                              </Badge>
                            )}
                          </div>
                        </div>
                        <CardDescription className="font-mono text-xs break-all">
                          {client.clientId}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(client)}
                          title="Edit app client"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewDetails(client)}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEdit(client)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDeleteClick(client)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Providers:</span>
                    <Badge variant="secondary">{client.providers_count || 0}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Authorized Callback URLs:</span>
                    <Badge variant="outline">{client.authorizedCallbackUrls?.length || 0}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Scopes:</span>
                    <Badge variant="outline">{client.scopes?.length || 0}</Badge>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleViewDetails(client)}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Manage
                  </Button>
                </CardFooter>
              </Card>
            );
            })}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <AppClientFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleSuccess}
        authConfigId={authConfigId}
        teamId={teamId}
      />

      {/* Edit Dialog */}
      <AppClientFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={handleSuccess}
        authConfigId={authConfigId}
        appClient={selectedClient}
        teamId={teamId}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete App Client?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the app client
              {selectedClient && ` "${selectedClient.name}"`} and all associated providers.
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














