'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Settings, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useDashboardCacheStore } from '@/store/dashboard-cache';
import { AppClientList } from './app-client-list';
import { AuthConfigFormDialog } from './auth-config-form-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface AuthConfigDetailProps {
  authConfigId: string;
  onBack: () => void;
}

export function AuthConfigDetail({ authConfigId, onBack }: AuthConfigDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const getAuthConfig = useDashboardCacheStore((s) => s.getAuthConfig);
  const invalidateAndRefetch = useDashboardCacheStore((s) => s.invalidateAndRefetch);
  const authConfig = getAuthConfig(authConfigId) ?? null;
  const loading = useDashboardCacheStore((s) => s.isBootstrapping);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const handleDeleteConfirm = async () => {
    if (!authConfig) return;

    try {
      setDeleting(true);
      await api.deleteAuthConfig(authConfig.id);
      await invalidateAndRefetch();
      toast({
        title: 'Success',
        description: 'Auth config deleted successfully',
      });
      router.push('/dashboard/auth-configs');
    } catch (error) {
      console.error('Error deleting auth config:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete auth config',
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

  if (!authConfig) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Auth config not found</p>
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
            <h2 className="text-2xl font-bold">{authConfig.name}</h2>
            <p className="text-muted-foreground mt-1 font-mono text-sm">{authConfig.id}</p>
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

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">App Clients</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{authConfig.app_clients_count || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* App Clients */}
        <div className="mt-6">
          <AppClientList authConfigId={authConfigId} onRefresh={() => invalidateAndRefetch()} />
        </div>
      </div>

      {/* Edit Dialog */}
      <AuthConfigFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={handleSuccess}
        authConfig={authConfig}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Auth Config?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the auth config
              {authConfig && ` "${authConfig.name}"`} and all associated app clients and providers.
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

