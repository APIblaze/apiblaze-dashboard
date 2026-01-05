'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import type { UserPool } from '@/types/user-pool';

interface UserPoolFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  userPool?: UserPool | null;
}

export function UserPoolFormDialog({
  open,
  onOpenChange,
  onSuccess,
  userPool,
}: UserPoolFormDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (userPool) {
        setName(userPool.name);
      } else {
        setName('');
      }
    }
  }, [open, userPool]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'User pool name is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSubmitting(true);
      
      if (userPool) {
        await api.updateUserPool(userPool.id, { name: name.trim() });
        toast({
          title: 'Success',
          description: 'User pool updated successfully',
        });
      } else {
        await api.createUserPool({ name: name.trim() });
        toast({
          title: 'Success',
          description: 'User pool created successfully',
        });
      }
      
      onSuccess();
    } catch (error) {
      console.error('Error saving user pool:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save user pool',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{userPool ? 'Edit User Pool' : 'Create User Pool'}</DialogTitle>
            <DialogDescription>
              {userPool
                ? 'Update the user pool name and settings.'
                : 'Create a new user pool to manage authentication for your applications.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My User Pool"
                disabled={submitting}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {userPool ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                userPool ? 'Update' : 'Create'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}













