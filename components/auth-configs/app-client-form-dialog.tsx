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
import { Loader2, Plus, X, Star, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import type { AppClient, CreateAppClientRequest } from '@/types/auth-config';

type CreateAppClientResponse = AppClient & {
  clientSecret?: string;
};

interface AppClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  authConfigId: string;
  appClient?: AppClient | null;
  projectName?: string;
  apiVersion?: string;
}

export function AppClientFormDialog({
  open,
  onOpenChange,
  onSuccess,
  authConfigId,
  appClient,
  projectName: initialProjectName,
  apiVersion: initialApiVersion,
}: AppClientFormDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [projectName, setProjectName] = useState(initialProjectName ?? '');
  const [apiVersion, setApiVersion] = useState(initialApiVersion ?? '1.0.0');
  const [refreshTokenExpiry, setRefreshTokenExpiry] = useState(2592000); // 30 days
  const [idTokenExpiry, setIdTokenExpiry] = useState(3600); // 1 hour
  const [accessTokenExpiry, setAccessTokenExpiry] = useState(3600); // 1 hour
  const [authorizedCallbackUrls, setAuthorizedCallbackUrls] = useState<string[]>([]);
  const [newAuthorizedCallbackUrl, setNewAuthorizedCallbackUrl] = useState('');
  const [signoutUris, setSignoutUris] = useState<string[]>([]);
  const [newSignoutUri, setNewSignoutUri] = useState('');
  const [scopes, setScopes] = useState<string[]>(['email', 'openid', 'profile']);
  const [newScope, setNewScope] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (appClient) {
        setName(appClient.name);
        setRefreshTokenExpiry(appClient.refreshTokenExpiry ?? 2592000);
        setIdTokenExpiry(appClient.idTokenExpiry ?? 3600);
        setAccessTokenExpiry(appClient.accessTokenExpiry ?? 3600);
        setAuthorizedCallbackUrls(appClient.authorizedCallbackUrls ?? []);
        setSignoutUris(appClient.signoutUris ?? []);
        setScopes(appClient.scopes ?? ['email', 'openid', 'profile']);
        setClientSecret(null);
      } else {
        setName('');
        setProjectName(initialProjectName ?? '');
        setApiVersion(initialApiVersion ?? '1.0.0');
        setRefreshTokenExpiry(2592000);
        setIdTokenExpiry(3600);
        setAccessTokenExpiry(3600);
        setAuthorizedCallbackUrls([]);
        setSignoutUris([]);
        setScopes(['email', 'openid', 'profile']);
        setClientSecret(null);
      }
    }
  }, [open, appClient, initialProjectName, initialApiVersion]);

  const validateHttpsUrl = (url: string): { valid: boolean; error?: string } => {
    try {
      const urlObj = new URL(url);
      if (urlObj.protocol !== 'https:') {
        return { valid: false, error: 'URL must use HTTPS protocol' };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }
  };

  const addAuthorizedCallbackUrl = () => {
    const url = newAuthorizedCallbackUrl.trim();
    if (!url) return;

    if (authorizedCallbackUrls.includes(url)) {
      toast({
        title: 'Validation Error',
        description: 'This URL is already in the list',
        variant: 'destructive',
      });
      return;
    }

    const validation = validateHttpsUrl(url);
    if (!validation.valid) {
      toast({
        title: 'Validation Error',
        description: validation.error || 'Invalid URL',
        variant: 'destructive',
      });
      return;
    }

    setAuthorizedCallbackUrls([...authorizedCallbackUrls, url]);
    setNewAuthorizedCallbackUrl('');
  };

  const removeAuthorizedCallbackUrl = (url: string) => {
    setAuthorizedCallbackUrls(authorizedCallbackUrls.filter((u) => u !== url));
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

    if (!appClient && (!projectName.trim() || !apiVersion.trim())) {
      toast({
        title: 'Validation Error',
        description: 'Project name and API version are required when creating an app client',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSubmitting(true);
      
      if (appClient) {
        await api.updateAppClient(authConfigId, appClient.id, {
          name: name.trim(),
          refreshTokenExpiry,
          idTokenExpiry,
          accessTokenExpiry,
          authorizedCallbackUrls,
          signoutUris,
          scopes,
        });
        toast({
          title: 'Success',
          description: 'App client updated successfully',
        });
      } else {
        const createData: CreateAppClientRequest = {
          name: name.trim(),
          projectName: projectName.trim(),
          apiVersion: apiVersion.trim(),
          refreshTokenExpiry,
          idTokenExpiry,
          accessTokenExpiry,
          authorizedCallbackUrls,
          signoutUris,
          scopes,
        };
        const result = await api.createAppClient(authConfigId, createData) as CreateAppClientResponse;
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

                {!appClient && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="projectName">Project Name</Label>
                      <Input
                        id="projectName"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        placeholder="my-project"
                        disabled={submitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="apiVersion">API Version</Label>
                      <Input
                        id="apiVersion"
                        value={apiVersion}
                        onChange={(e) => setApiVersion(e.target.value)}
                        placeholder="1.0.0"
                        disabled={submitting}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen((o) => !o)}
                    className="flex items-center gap-2 w-full text-left font-medium text-sm"
                  >
                    {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    Advanced Settings
                  </button>
                  {advancedOpen && (
                    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
                      <div className="space-y-2">
                        <Label>Authorized Scopes</Label>
                        <p className="text-xs text-muted-foreground">
                          Default mandatory scopes: email, openid, profile (or provider-specific). Add or remove below.
                        </p>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {scopes.map((scope) => (
                            <Badge key={scope} variant="secondary" className="gap-1">
                              {scope}
                              <button
                                type="button"
                                onClick={() => setScopes((prev) => prev.filter((s) => s !== scope))}
                                className="ml-0.5 rounded hover:bg-muted"
                                disabled={submitting}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Input
                            value={newScope}
                            onChange={(e) => setNewScope(e.target.value)}
                            placeholder="Add custom scope"
                            disabled={submitting}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const s = newScope.trim();
                                if (s && !scopes.includes(s)) {
                                  setScopes((prev) => [...prev, s]);
                                  setNewScope('');
                                }
                              }
                            }}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const s = newScope.trim();
                              if (s && !scopes.includes(s)) {
                                setScopes((prev) => [...prev, s]);
                                setNewScope('');
                              }
                            }}
                            disabled={submitting}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
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
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Authorized Callback URLs</Label>
                    <span className="text-xs text-muted-foreground">(HTTPS required)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The first URL will be marked as the default callback URL.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={newAuthorizedCallbackUrl}
                      onChange={(e) => setNewAuthorizedCallbackUrl(e.target.value)}
                      placeholder="https://example.com/callback"
                      disabled={submitting}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addAuthorizedCallbackUrl();
                        }
                      }}
                    />
                    <Button type="button" onClick={addAuthorizedCallbackUrl} disabled={submitting}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {authorizedCallbackUrls.map((url, index) => (
                      <div
                        key={url}
                        className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-sm"
                      >
                        {index === 0 && (
                          <Badge variant="secondary" className="mr-1 text-xs">
                            <Star className="h-3 w-3 mr-1" />
                            Default
                          </Badge>
                        )}
                        <span>{url}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          onClick={() => removeAuthorizedCallbackUrl(url)}
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














