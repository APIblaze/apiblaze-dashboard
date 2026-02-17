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
import { Switch } from '@/components/ui/switch';
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
  const [targetServerToken, setTargetServerToken] = useState<'apiblaze' | 'third_party_access_token' | 'third_party_id_token' | 'none'>('apiblaze');
  const [includeApiblazeAccessTokenHeader, setIncludeApiblazeAccessTokenHeader] = useState(false);
  const [includeApiblazeIdTokenHeader, setIncludeApiblazeIdTokenHeader] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (provider) {
        setType(provider.type);
        setClientIdValue(provider.clientId ?? (provider as { client_id?: string }).client_id ?? '');
        setClientSecret(provider.clientSecret ?? (provider as { client_secret?: string }).client_secret ?? '');
        setDomain(provider.domain || '');
        setTokenType(((provider.tokenType ?? (provider as { token_type?: string }).token_type) ?? 'apiblaze') as 'apiblaze' | 'thirdParty');
        setTargetServerToken((provider.targetServerToken ?? (provider as { target_server_token?: string }).target_server_token ?? 'apiblaze') as 'apiblaze' | 'third_party_access_token' | 'third_party_id_token' | 'none');
        setIncludeApiblazeAccessTokenHeader(provider.includeApiblazeAccessTokenHeader ?? (provider as { include_apiblaze_access_token_header?: boolean }).include_apiblaze_access_token_header ?? (provider as { include_apiblaze_token_header?: boolean }).include_apiblaze_token_header ?? false);
        setIncludeApiblazeIdTokenHeader(provider.includeApiblazeIdTokenHeader ?? (provider as { include_apiblaze_id_token_header?: boolean }).include_apiblaze_id_token_header ?? false);
      } else {
        setType('google');
        setClientIdValue('');
        setClientSecret('');
        setDomain(PROVIDER_DOMAINS.google);
        setTokenType('apiblaze');
        setTargetServerToken('apiblaze');
        setIncludeApiblazeAccessTokenHeader(false);
        setIncludeApiblazeIdTokenHeader(false);
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
        targetServerToken,
        includeApiblazeAccessTokenHeader,
        includeApiblazeIdTokenHeader,
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
              <Label htmlFor="tokenType">Client side token type</Label>
              <p className="text-xs text-muted-foreground">
                {tokenType === 'thirdParty'
                  ? 'Tokens the API users will see and that will be forwarded to your target servers'
                  : 'Tokens the API users will see'}
              </p>
              <Select value={tokenType} onValueChange={(value) => setTokenType(value as 'apiblaze' | 'thirdParty')} disabled={submitting}>
                <SelectTrigger id="tokenType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="apiblaze">API Blaze JWT token</SelectItem>
                  <SelectItem value="thirdParty">Third Party</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {tokenType !== 'thirdParty' && (
            <div className="space-y-2">
              <Label htmlFor="targetServerToken">Target server token type</Label>
              <p className="text-xs text-muted-foreground">What to send in the Authorization header when forwarding to your target servers</p>
              <Select value={targetServerToken} onValueChange={(value) => setTargetServerToken(value as 'apiblaze' | 'third_party_access_token' | 'third_party_id_token' | 'none')} disabled={submitting}>
                <SelectTrigger id="targetServerToken">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="apiblaze">API Blaze JWT token</SelectItem>
                  <SelectItem value="third_party_access_token">{PROVIDER_TYPES.find(p => p.value === type)?.label ?? type} access token</SelectItem>
                  <SelectItem value="third_party_id_token">{PROVIDER_TYPES.find(p => p.value === type)?.label ?? type} ID token</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
              {(targetServerToken === 'third_party_access_token' || targetServerToken === 'third_party_id_token') && (
                <div className="space-y-2 mt-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="includeApiblazeAccessTokenHeader"
                      checked={includeApiblazeAccessTokenHeader}
                      onCheckedChange={setIncludeApiblazeAccessTokenHeader}
                      disabled={submitting}
                    />
                    <Label htmlFor="includeApiblazeAccessTokenHeader" className="text-sm">
                      Include APIBlaze access token in x-apiblaze-access-token header
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="includeApiblazeIdTokenHeader"
                      checked={includeApiblazeIdTokenHeader}
                      onCheckedChange={setIncludeApiblazeIdTokenHeader}
                      disabled={submitting}
                    />
                    <Label htmlFor="includeApiblazeIdTokenHeader" className="text-sm">
                      Include APIBlaze ID token in x-apiblaze-id-token header
                    </Label>
                  </div>
                </div>
              )}
            </div>
            )}
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














