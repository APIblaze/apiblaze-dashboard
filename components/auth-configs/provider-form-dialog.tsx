'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import type { SocialProvider, CreateProviderRequest } from '@/types/auth-config';

interface ProviderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  authConfigId: string;
  clientId: string;
  provider?: SocialProvider | null;
}

const PROVIDER_TYPES: Array<{ value: SocialProvider['type']; label: string }> = [
  { value: 'google', label: 'Google' },
  { value: 'github', label: 'GitHub' },
  { value: 'microsoft', label: 'Microsoft' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'auth0', label: 'Auth0' },
  { value: 'other', label: 'Other' },
];

const PROVIDER_DOMAINS: Record<SocialProvider['type'], string> = {
  google: 'https://accounts.google.com',
  microsoft: 'https://login.microsoftonline.com',
  github: 'https://github.com',
  facebook: 'https://www.facebook.com',
  auth0: 'https://YOUR_DOMAIN.auth0.com',
  other: '',
};

export function ProviderFormDialog({
  open,
  onOpenChange,
  onSuccess,
  authConfigId,
  clientId,
  provider,
}: ProviderFormDialogProps) {
  const { toast } = useToast();
  const [type, setType] = useState<SocialProvider['type']>('google');
  const [clientIdValue, setClientIdValue] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [domain, setDomain] = useState('');
  const [tokenType, setTokenType] = useState<'apiblaze' | 'thirdParty'>('apiblaze');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (provider) {
        setType(provider.type);
        setClientIdValue(provider.clientId ?? (provider as { client_id?: string }).client_id ?? '');
        setClientSecret(provider.clientSecret ?? (provider as { client_secret?: string }).client_secret ?? '');
        setDomain(provider.domain || '');
        setTokenType(((provider.tokenType ?? (provider as { token_type?: string }).token_type) ?? 'apiblaze') as 'apiblaze' | 'thirdParty');
      } else {
        setType('google');
        setClientIdValue('');
        setClientSecret('');
        setDomain(PROVIDER_DOMAINS.google);
        setTokenType('apiblaze');
      }
    }
  }, [open, provider]);

  useEffect(() => {
    if (type && !provider) {
      setDomain(PROVIDER_DOMAINS[type] || '');
    }
  }, [type, provider]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!type || !clientIdValue.trim() || !clientSecret.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Provider type, client ID, and client secret are required',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSubmitting(true);
      
      const data: CreateProviderRequest = {
        type,
        clientId: clientIdValue.trim(),
        clientSecret: clientSecret.trim(),
        domain: domain.trim() || undefined,
        tokenType,
      };
      
      if (provider) {
        await api.updateProvider(authConfigId, clientId, provider.id, data);
        toast({
          title: 'Success',
          description: 'Provider updated successfully',
        });
      } else {
        await api.addProvider(authConfigId, clientId, data);
        toast({
          title: 'Success',
          description: 'Provider created successfully',
        });
      }
      
      onSuccess();
    } catch (error) {
      console.error('Error saving provider:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save provider',
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
            <DialogTitle>{provider ? 'Edit Provider' : 'Add Provider'}</DialogTitle>
            <DialogDescription>
              {provider
                ? 'Update the OAuth provider configuration.'
                : 'Add a new OAuth provider for social authentication.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="type">Provider Type</Label>
              <Select value={type} onValueChange={(value) => setType(value as SocialProvider['type'])} disabled={submitting}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_TYPES.map((pt) => (
                    <SelectItem key={pt.value} value={pt.value}>
                      {pt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="clientId">Client ID</Label>
              <Input
                id="clientId"
                value={clientIdValue}
                onChange={(e) => setClientIdValue(e.target.value)}
                placeholder="Enter client ID"
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="clientSecret">Client Secret</Label>
              <Input
                id="clientSecret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="Enter client secret"
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="domain">Domain (Optional)</Label>
              <Input
                id="domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="https://example.com"
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground">
                OAuth provider domain (required for Auth0)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tokenType">Token Type</Label>
              <Select value={tokenType} onValueChange={(value) => setTokenType(value as 'apiblaze' | 'thirdParty')} disabled={submitting}>
                <SelectTrigger id="tokenType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="apiblaze">APIBlaze</SelectItem>
                  <SelectItem value="thirdParty">Third Party</SelectItem>
                </SelectContent>
              </Select>
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
                  {provider ? 'Updating...' : 'Adding...'}
                </>
              ) : (
                provider ? 'Update' : 'Add'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}














