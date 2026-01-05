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
import { Loader2, Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import type { AppClient, CreateAppClientRequest } from '@/types/user-pool';

type CreateAppClientResponse = AppClient & {
  clientSecret?: string;
};

interface AppClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  poolId: string;
  appClient?: AppClient | null;
}

export function AppClientFormDialog({
  open,
  onOpenChange,
  onSuccess,
  poolId,
  appClient,
}: AppClientFormDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [refreshTokenExpiry, setRefreshTokenExpiry] = useState(2592000); // 30 days
  const [idTokenExpiry, setIdTokenExpiry] = useState(3600); // 1 hour
  const [accessTokenExpiry, setAccessTokenExpiry] = useState(3600); // 1 hour
  const [redirectUris, setRedirectUris] = useState<string[]>([]);
  const [newRedirectUri, setNewRedirectUri] = useState('');
  const [signoutUris, setSignoutUris] = useState<string[]>([]);
  const [newSignoutUri, setNewSignoutUri] = useState('');
  const [scopes, setScopes] = useState<string[]>(['email', 'openid', 'profile']);
  const [newScope, setNewScope] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (appClient) {
        setName(appClient.name);
        setRefreshTokenExpiry(appClient.refreshTokenExpiry);
        setIdTokenExpiry(appClient.idTokenExpiry);
        setAccessTokenExpiry(appClient.accessTokenExpiry);
        setRedirectUris(appClient.redirectUris || []);
        setSignoutUris(appClient.signoutUris || []);
        setScopes(appClient.scopes || []);
        setClientSecret(null);
      } else {
        setName('');
        setRefreshTokenExpiry(2592000);
        setIdTokenExpiry(3600);
        setAccessTokenExpiry(3600);
        setRedirectUris([]);
        setSignoutUris([]);
        setScopes(['email', 'openid', 'profile']);
        setClientSecret(null);
      }
    }
  }, [open, appClient]);

  const addRedirectUri = () => {
    if (newRedirectUri.trim() && !redirectUris.includes(newRedirectUri.trim())) {
      setRedirectUris([...redirectUris, newRedirectUri.trim()]);
      setNewRedirectUri('');
    }
  };

  const removeRedirectUri = (uri: string) => {
    setRedirectUris(redirectUris.filter((u) => u !== uri));
  };

  const addSignoutUri = () => {
    if (newSignoutUri.trim() && !signoutUris.includes(newSignoutUri.trim())) {
      setSignoutUris([...signoutUris, newSignoutUri.trim()]);
      setNewSignoutUri('');
    }
  };

  const removeSignoutUri = (uri: string) => {
    setSignoutUris(signoutUris.filter((u) => u !== uri));
  };

  const addScope = () => {
    if (newScope.trim() && !scopes.includes(newScope.trim())) {
      setScopes([...scopes, newScope.trim()]);
      setNewScope('');
    }
  };

  const removeScope = (scope: string) => {
    setScopes(scopes.filter((s) => s !== scope));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'App client name is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSubmitting(true);
      
      const data: CreateAppClientRequest = {
        name: name.trim(),
        refreshTokenExpiry,
        idTokenExpiry,
        accessTokenExpiry,
        redirectUris,
        signoutUris,
        scopes,
      };
      
      if (appClient) {
        await api.updateAppClient(poolId, appClient.id, data);
        toast({
          title: 'Success',
          description: 'App client updated successfully',
        });
      } else {
        const result = await api.createAppClient(poolId, data) as CreateAppClientResponse;
        if (result.clientSecret) {
          setClientSecret(result.clientSecret);
          toast({
            title: 'Success',
            description: 'App client created successfully. Make sure to copy the client secret!',
          });
        } else {
          toast({
            title: 'Success',
            description: 'App client created successfully',
          });
        }
      }
      
      if (!clientSecret) {
        onSuccess();
      }
    } catch (error) {
      console.error('Error saving app client:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save app client',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (clientSecret) {
      setClientSecret(null);
      onSuccess();
    } else {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{appClient ? 'Edit App Client' : 'Create App Client'}</DialogTitle>
            <DialogDescription>
              {appClient
                ? 'Update the app client configuration.'
                : 'Create a new OAuth app client for authentication.'}
            </DialogDescription>
          </DialogHeader>
          
          {clientSecret ? (
            <div className="space-y-4 py-4">
              <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <h4 className="font-semibold mb-2">Client Secret (Save this now!)</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  This is the only time you&apos;ll see the client secret. Make sure to copy it.
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    value={clientSecret}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(clientSecret);
                        toast({
                          title: 'Copied',
                          description: 'Client secret copied to clipboard',
                        });
                      } catch (error) {
                        console.error('Failed to copy to clipboard:', error);
                        toast({
                          title: 'Error',
                          description: 'Failed to copy to clipboard. Please try again.',
                          variant: 'destructive',
                        });
                      }
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" onClick={handleClose}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My App Client"
                    disabled={submitting}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="refreshTokenExpiry">Refresh Token Expiry (seconds)</Label>
                    <Input
                      id="refreshTokenExpiry"
                      type="number"
                      value={refreshTokenExpiry}
                      onChange={(e) => setRefreshTokenExpiry(Number(e.target.value))}
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="idTokenExpiry">ID Token Expiry (seconds)</Label>
                    <Input
                      id="idTokenExpiry"
                      type="number"
                      value={idTokenExpiry}
                      onChange={(e) => setIdTokenExpiry(Number(e.target.value))}
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accessTokenExpiry">Access Token Expiry (seconds)</Label>
                    <Input
                      id="accessTokenExpiry"
                      type="number"
                      value={accessTokenExpiry}
                      onChange={(e) => setAccessTokenExpiry(Number(e.target.value))}
                      disabled={submitting}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Redirect URIs</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newRedirectUri}
                      onChange={(e) => setNewRedirectUri(e.target.value)}
                      placeholder="https://example.com/callback"
                      disabled={submitting}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addRedirectUri();
                        }
                      }}
                    />
                    <Button type="button" onClick={addRedirectUri} disabled={submitting}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {redirectUris.map((uri) => (
                      <div
                        key={uri}
                        className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-sm"
                      >
                        <span>{uri}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          onClick={() => removeRedirectUri(uri)}
                          disabled={submitting}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Signout URIs</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newSignoutUri}
                      onChange={(e) => setNewSignoutUri(e.target.value)}
                      placeholder="https://example.com/signout"
                      disabled={submitting}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addSignoutUri();
                        }
                      }}
                    />
                    <Button type="button" onClick={addSignoutUri} disabled={submitting}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {signoutUris.map((uri) => (
                      <div
                        key={uri}
                        className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-sm"
                      >
                        <span>{uri}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          onClick={() => removeSignoutUri(uri)}
                          disabled={submitting}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Scopes</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newScope}
                      onChange={(e) => setNewScope(e.target.value)}
                      placeholder="openid"
                      disabled={submitting}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addScope();
                        }
                      }}
                    />
                    <Button type="button" onClick={addScope} disabled={submitting}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {scopes.map((scope) => (
                      <div
                        key={scope}
                        className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-sm"
                      >
                        <span>{scope}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          onClick={() => removeScope(scope)}
                          disabled={submitting}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
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
                      {appClient ? 'Updating...' : 'Creating...'}
                    </>
                  ) : (
                    appClient ? 'Update' : 'Create'
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}













