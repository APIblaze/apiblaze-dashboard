'use client';

import { useState, useEffect, useCallback } from 'react';
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
import type { UserPool } from '@/types/user-pool';
import { UserPoolFormDialog } from './user-pool-form-dialog';

export function UserPoolList() {
  const router = useRouter();
  const { toast } = useToast();
  const [userPools, setUserPools] = useState<UserPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPool, setSelectedPool] = useState<UserPool | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUserPools = useCallback(async () => {
    try {
      setLoading(true);
      const pools = await api.listUserPools();
      setUserPools(pools);
    } catch (error) {
      console.error('Error fetching user pools:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load user pools',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchUserPools();
  }, [fetchUserPools]);

  const handleCreate = () => {
    setSelectedPool(null);
    setCreateDialogOpen(true);
  };

  const handleEdit = (pool: UserPool) => {
    setSelectedPool(pool);
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (pool: UserPool) => {
    setSelectedPool(pool);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedPool) return;

    try {
      setDeleting(true);
      await api.deleteUserPool(selectedPool.id);
      toast({
        title: 'Success',
        description: 'User pool deleted successfully',
      });
      setDeleteDialogOpen(false);
      setSelectedPool(null);
      fetchUserPools();
    } catch (error) {
      console.error('Error deleting user pool:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete user pool',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleViewDetails = (pool: UserPool) => {
    router.push(`/dashboard/user-pools?pool=${pool.id}`);
  };

  const handleSuccess = () => {
    setCreateDialogOpen(false);
    setEditDialogOpen(false);
    setSelectedPool(null);
    fetchUserPools();
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
            <h2 className="text-2xl font-bold">User Pools</h2>
            <p className="text-muted-foreground mt-1">
              Manage your user pools, app clients, and authentication providers
            </p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add User Pool
          </Button>
        </div>

        {/* User Pools Grid */}
        {userPools.length === 0 ? (
          <Card className="border-2 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <UserCog className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No user pools yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create your first user pool to get started with authentication management
              </p>
              <Button onClick={handleCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Create User Pool
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {userPools.map((pool) => (
              <Card key={pool.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-1">{pool.name}</CardTitle>
                      <CardDescription className="font-mono text-xs">
                        {pool.id}
                      </CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleViewDetails(pool)}>
                          <Settings className="mr-2 h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEdit(pool)}>
                          <Settings className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDeleteClick(pool)}
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
                      <div className="text-2xl font-bold">{pool.app_clients_count || 0}</div>
                      <div className="text-xs text-muted-foreground">App Clients</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{pool.users_count || 0}</div>
                      <div className="text-xs text-muted-foreground">Users</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{pool.groups_count || 0}</div>
                      <div className="text-xs text-muted-foreground">Groups</div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleViewDetails(pool)}
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
      <UserPoolFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleSuccess}
      />

      {/* Edit Dialog */}
      <UserPoolFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={handleSuccess}
        userPool={selectedPool}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User Pool?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the user pool
              {selectedPool && ` "${selectedPool.name}"`} and all associated data.
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













