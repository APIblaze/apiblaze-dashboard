'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertTriangle } from 'lucide-react';

interface DeleteProjectConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectDisplayName: string;
  onConfirm: () => Promise<void>;
  isDeleting?: boolean;
}

export function DeleteProjectConfirmDialog({
  open,
  onOpenChange,
  projectDisplayName,
  onConfirm,
  isDeleting = false,
}: DeleteProjectConfirmDialogProps) {
  const [confirmText, setConfirmText] = useState('');
  const isMatch = confirmText.trim() === projectDisplayName.trim();

  useEffect(() => {
    if (!open) {
      setConfirmText('');
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!isMatch || isDeleting) return;
    await onConfirm();
  };

  const handleOpenChange = (next: boolean) => {
    if (!isDeleting) {
      onOpenChange(next);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md border-destructive/30 bg-gradient-to-b from-background to-destructive/5">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-destructive/15">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <div className="space-y-1.5">
              <DialogTitle className="text-xl">Are you sure you want to delete?</DialogTitle>
              <DialogDescription className="text-base">
                This action cannot be undone. The project{' '}
                <span className="font-semibold text-foreground">{projectDisplayName}</span> and all
                its data will be permanently removed.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Label htmlFor="confirm-delete" className="text-sm font-medium">
            Type <span className="font-mono font-semibold text-destructive">{projectDisplayName}</span> to confirm
          </Label>
          <Input
            id="confirm-delete"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Project name"
            className="font-mono border-destructive/30 focus-visible:ring-destructive/50"
            disabled={isDeleting}
            autoComplete="off"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!isMatch || isDeleting}
            className="min-w-[120px]"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting…
              </>
            ) : (
              'Delete Project'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
