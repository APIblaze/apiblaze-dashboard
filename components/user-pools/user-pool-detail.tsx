'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ArrowLeft, Settings, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import type { UserPool } from '@/types/user-pool';
import { AppClientList } from './app-client-list';
import { UsersList } from './users-list';
import { GroupsList } from './groups-list';
import { UserPoolFormDialog } from './user-pool-form-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface UserPoolDetailProps {
  poolId: string;
  onBack: () => void;
}

export function UserPoolDetail({ poolId, onBack }: UserPoolDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [userPool, setUserPool] = useState<UserPool | null>(null);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState('app-clients');

  useEffect(() => {
    fetchUserPool();
  }, [poolId]);

  const fetchUserPool = async () => {
    try {
      setLoading(true);
      const pool = await api.getUserPool(poolId);
      setUserPool(pool);
    } catch (error) {
      console.error('Error fetching user pool:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load user pool',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!userPool) return;

    try {
      setDeleting(true);
      await api.deleteUserPool(userPool.id);
      toast({
        title: 'Success',
        description: 'User pool deleted successfully',
      });
      router.push('/dashboard/user-pools');
    } catch (error) {
      console.error('Error deleting user pool:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete user pool',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleSuccess = () => {
    setEditDialogOpen(false);
    fetchUserPool();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!userPool) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">User pool not found</p>
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
            <h2 className="text-2xl font-bold">{userPool.name}</h2>
            <p className="text-muted-foreground mt-1 font-mono text-sm">{userPool.id}</p>
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

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">App Clients</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{userPool.app_clients_count || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{userPool.users_count || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Groups</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{userPool.groups_count || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="app-clients">App Clients</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="groups">Groups</TabsTrigger>
          </TabsList>
          <TabsContent value="app-clients" className="mt-6">
            <AppClientList poolId={poolId} onRefresh={fetchUserPool} />
          </TabsContent>
          <TabsContent value="users" className="mt-6">
            <UsersList poolId={poolId} onRefresh={fetchUserPool} />
          </TabsContent>
          <TabsContent value="groups" className="mt-6">
            <GroupsList poolId={poolId} onRefresh={fetchUserPool} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Dialog */}
      <UserPoolFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={handleSuccess}
        userPool={userPool}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User Pool?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the user pool
              {userPool && ` "${userPool.name}"`} and all associated data including app clients,
              providers, users, and groups.
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













