'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Users, Key, UserCog, Settings, Trash2, MoreVertical } from 'lucide-react';
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
import type { AuthConfig } from '@/types/auth-config';
import { AuthConfigFormDialog } from './auth-config-form-dialog';

export function AuthConfigList() {
  const router = useRouter();
  const { toast } = useToast();
  const authConfigs = useDashboardCacheStore((s) => s.getAuthConfigs());
  const loading = useDashboardCacheStore((s) => s.isBootstrapping);
  const invalidateAndRefetch = useDashboardCacheStore((s) => s.invalidateAndRefetch);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<AuthConfig | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleCreate = () => {
    setSelectedConfig(null);
    setCreateDialogOpen(true);
  };

  const handleEdit = (config: AuthConfig) => {
    setSelectedConfig(config);
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (config: AuthConfig) => {
    setSelectedConfig(config);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedConfig) return;

    try {
      setDeleting(true);
      await api.deleteAuthConfig(selectedConfig.id);
      toast({
        title: 'Success',
        description: 'Auth config deleted successfully',
      });
      setDeleteDialogOpen(false);
      setSelectedConfig(null);
      await invalidateAndRefetch();
    } catch (error) {
      console.error('Error deleting auth config:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete auth config',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleViewDetails = (config: AuthConfig) => {
    router.push(`/dashboard/auth-configs?authConfig=${config.id}`);
  };

  const handleSuccess = async () => {
    setCreateDialogOpen(false);
    setEditDialogOpen(false);
    setSelectedConfig(null);
    await invalidateAndRefetch();
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
            <h2 className="text-2xl font-bold">Auth Configs</h2>
            <p className="text-muted-foreground mt-1">
              Manage your auth configs, app clients, and authentication providers
            </p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Auth Config
          </Button>
        </div>

        {/* Auth Configs Grid */}
        {authConfigs.length === 0 ? (
          <Card className="border-2 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <UserCog className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No auth configs yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create your first auth config to get started with authentication management
              </p>
              <Button onClick={handleCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Create Auth Config
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {authConfigs.map((config) => (
              <Card key={config.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-1">{config.name}</CardTitle>
                      <CardDescription className="font-mono text-xs">
                        {config.id}
                      </CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleViewDetails(config)}>
                          <Settings className="mr-2 h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEdit(config)}>
                          <Settings className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDeleteClick(config)}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{config.app_clients_count || 0}</div>
                      <div className="text-xs text-muted-foreground">App Clients</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{config.users_count || 0}</div>
                      <div className="text-xs text-muted-foreground">Users</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{config.groups_count || 0}</div>
                      <div className="text-xs text-muted-foreground">Groups</div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleViewDetails(config)}
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Manage
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <AuthConfigFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleSuccess}
      />

      {/* Edit Dialog */}
      <AuthConfigFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={handleSuccess}
        authConfig={selectedConfig}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Auth Config?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the auth config
              {selectedConfig && ` "${selectedConfig.name}"`} and all associated data.
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

