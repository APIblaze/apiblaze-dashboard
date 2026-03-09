'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Plus, Key, Trash2, Pencil, MoreVertical, ExternalLink } from 'lucide-react';
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
import type { AppClient } from '@/types/auth-config';
import { AppClientFormDialog } from './app-client-form-dialog';

interface TenantDetailProps {
  teamId: string;
  tenantName: string;
  displayName: string;
  onBack: () => void;
}

export function TenantDetail({ teamId, tenantName, displayName, onBack }: TenantDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [appClients, setAppClients] = useState<AppClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<AppClient | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const list = await api.listAppClientsByTenant(teamId, tenantName);
      setAppClients(list);
    } catch {
      setAppClients([]);
      toast({
        title: 'Error',
        description: 'Failed to load app clients',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [teamId, tenantName]);

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
      await api.deleteAppClientByTenant(teamId, tenantName, selectedClient.id);
      toast({
        title: 'Success',
        description: 'App client deleted successfully',
      });
      setDeleteDialogOpen(false);
      setSelectedClient(null);
      await fetchClients();
    } catch (error) {
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
    router.push(`/dashboard/tenants?tenant=${encodeURIComponent(tenantName)}&client=${encodeURIComponent(client.id)}`);
  };

  const handleSuccess = async () => {
    setCreateDialogOpen(false);
    setEditDialogOpen(false);
    setSelectedClient(null);
    await fetchClients();
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
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" size="sm" onClick={onBack} className="mb-2 -ml-2">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <h2 className="text-2xl font-bold">{displayName}</h2>
            <p className="text-muted-foreground mt-1 font-mono text-sm">{tenantName}</p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add App Client
          </Button>
        </div>

        {appClients.length === 0 ? (
          <Card className="border-2 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Key className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No app clients yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create an app client to configure OAuth authentication for this tenant
              </p>
              <Button onClick={handleCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Create App Client
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {appClients.map((client) => (
              <Card key={client.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <CardTitle className="text-lg">{client.name}</CardTitle>
                        <div className="flex items-center gap-1.5">
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
                        {client.clientId ?? client.id}
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
            ))}
          </div>
        )}
      </div>

      <AppClientFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleSuccess}
        teamId={teamId}
        tenantName={tenantName}
      />

      <AppClientFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={handleSuccess}
        teamId={teamId}
        tenantName={tenantName}
        appClient={selectedClient ?? undefined}
      />

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
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleting}>
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
