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
import type { AuthConfig } from '@/types/auth-config';

interface AuthConfigFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  authConfig?: AuthConfig | null;
}

export function AuthConfigFormDialog({
  open,
  onOpenChange,
  onSuccess,
  authConfig,
}: AuthConfigFormDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (authConfig) {
        setName(authConfig.name);
      } else {
        setName('');
      }
    }
  }, [open, authConfig]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Auth config name is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSubmitting(true);
      
      if (authConfig) {
        await api.updateAuthConfig(authConfig.id, { name: name.trim() });
        toast({
          title: 'Success',
          description: 'Auth config updated successfully',
        });
      } else {
        await api.createAuthConfig({ name: name.trim() });
        toast({
          title: 'Success',
          description: 'Auth config created successfully',
        });
      }
      
      onSuccess();
    } catch (error) {
      console.error('Error saving auth config:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save auth config',
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
            <DialogTitle>{authConfig ? 'Edit Auth Config' : 'Create Auth Config'}</DialogTitle>
            <DialogDescription>
              {authConfig
                ? 'Update the auth config name and settings.'
                : 'Create a new auth config to manage authentication for your applications.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Auth Config"
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
                  {authConfig ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                authConfig ? 'Update' : 'Create'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

