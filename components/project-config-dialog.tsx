'use client';

import { useEffect, useState } from 'react';
import { Project } from '@/types/project';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, ExternalLink, Users, Key, Globe, Settings } from 'lucide-react';
import { api } from '@/lib/api';
import type { AuthConfig, AppClient, SocialProvider } from '@/types/auth-config';

// API response may have snake_case fields from the database
type AppClientResponse = AppClient & {
  client_id?: string;
  redirect_uris?: string[];
  signout_uris?: string[];
};

type SocialProviderResponse = SocialProvider & {
  client_id?: string;
};

interface ProjectConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
}

export function ProjectConfigDialog({ open, onOpenChange, project }: ProjectConfigDialogProps) {
  const [loading, setLoading] = useState(false);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [appClient, setAppClient] = useState<AppClientResponse | null>(null);
  const [providers, setProviders] = useState<SocialProviderResponse[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !project) {
      setAuthConfig(null);
      setAppClient(null);
      setProviders([]);
      setError(null);
      return;
    }

    // Extract auth_config_id and default_app_client_id from project config
    const config = project.config as Record<string, unknown> | undefined;
    const authConfigId = config?.auth_config_id as string | undefined;
    const defaultAppClientId = (config?.default_app_client_id || config?.defaultAppClient) as string | undefined;
    const appClientId = defaultAppClientId || (config?.app_client_id as string | undefined);

    if (!authConfigId || !appClientId) {
      // No user pool configured for this project
      return;
    }

    // Fetch user pool, app client, and providers
    const fetchAuthConfigDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch AuthConfig
        const pool = await api.getAuthConfig(authConfigId);
        setAuthConfig(pool);

        // Fetch AppClient
        const client = await api.getAppClient(authConfigId, appClientId);
        setAppClient(client);

        // Fetch Providers
        const providerList = await api.listProviders(authConfigId, appClientId);
        setProviders(providerList);
      } catch (err) {
        console.error('Error fetching user pool details:', err);
        setError(err instanceof Error ? err.message : 'Failed to load user pool details');
      } finally {
        setLoading(false);
      }
    };

    fetchAuthConfigDetails();
  }, [open, project]);

  if (!project) {
    return null;
  }

  const config = project.config as Record<string, unknown> | undefined;
  const authConfigId = config?.auth_config_id as string | undefined;
  const defaultAppClientId = (config?.default_app_client_id || config?.defaultAppClient) as string | undefined;
  const appClientId = defaultAppClientId || (config?.app_client_id as string | undefined);
  const hasAuthConfig = !!authConfigId && !!appClientId;
  
  // Build portal URL with clientId if available
  const getPortalUrl = () => {
    const portalUrl = project.urls.portal;
    if (appClient && appClient.clientId) {
      const clientId = (appClient as AppClientResponse).client_id || appClient.clientId;
      if (clientId) {
        try {
          const url = new URL(portalUrl);
          url.searchParams.set('clientId', clientId);
          return url.toString();
        } catch {
          // If URL parsing fails, return original URL
          return portalUrl;
        }
      }
    }
    return portalUrl;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Project Configuration</DialogTitle>
          <DialogDescription>
            View configuration details for {project.display_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Project Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Project Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Project ID</p>
                  <p className="text-sm font-mono">{project.project_id}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Display Name</p>
                  <p className="text-sm">{project.display_name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">API Version</p>
                  <Badge variant="secondary">{project.api_version}</Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                    {project.status}
                  </Badge>
                </div>
                {project.description && (
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-muted-foreground">Description</p>
                    <p className="text-sm">{project.description}</p>
                  </div>
                )}
              </div>

              <Separator />

              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">URLs</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">API</span>
                    <a
                      href={project.urls.api}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                    >
                      {project.urls.api}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Portal</span>
                    <a
                      href={getPortalUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                    >
                      {getPortalUrl()}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Auth</span>
                    <a
                      href={project.urls.auth}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                    >
                      {project.urls.auth}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Source</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{project.spec_source.type}</Badge>
                    {project.spec_source.github && (
                      <span className="text-sm font-mono">
                        {project.spec_source.github.owner}/{project.spec_source.github.repo}
                        {project.spec_source.github.branch && ` @ ${project.spec_source.github.branch}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* User Pool Configuration */}
          {hasAuthConfig && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  User Pool Configuration
                </CardTitle>
                <CardDescription>
                  Authentication and identity provider settings for this project
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : error ? (
                  <div className="text-sm text-destructive py-4">{error}</div>
                ) : (
                  <div className="space-y-6">
                    {/* AuthConfig Details */}
                    {authConfig && (
                      <div>
                        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          User Pool
                        </h4>
                        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Name</span>
                            <span className="text-sm font-medium">{authConfig.name}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">ID</span>
                            <span className="text-sm font-mono">{authConfig.id}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Created</span>
                            <span className="text-sm">
                              {new Date(authConfig.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* AppClient Details */}
                    {appClient && (
                      <div>
                        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                          <Key className="h-4 w-4" />
                          App Client
                        </h4>
                        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Name</span>
                            <span className="text-sm font-medium">{appClient.name}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Client ID</span>
                            <span className="text-sm font-mono">
                              {(appClient as AppClientResponse).client_id || appClient.clientId}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Scopes</span>
                            <div className="flex gap-1">
                              {(appClient.scopes || []).map((scope: string) => (
                                <Badge key={scope} variant="outline" className="text-xs">
                                  {scope}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          {((appClient as AppClientResponse).redirectUris || (appClient as AppClientResponse).redirect_uris || []).length > 0 && (
                            <div className="flex items-start justify-between">
                              <span className="text-sm text-muted-foreground">Redirect URIs</span>
                              <div className="flex flex-col gap-1 text-right">
                                {((appClient as AppClientResponse).redirectUris || (appClient as AppClientResponse).redirect_uris || []).map((uri: string, idx: number) => (
                                  <span key={idx} className="text-sm font-mono text-xs">
                                    {uri}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Created</span>
                            <span className="text-sm">
                              {new Date(appClient.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Providers */}
                    {providers.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                          <Globe className="h-4 w-4" />
                          Identity Providers
                        </h4>
                        <div className="space-y-3">
                          {providers.map((provider) => (
                            <div key={provider.id} className="bg-muted/50 rounded-lg p-4 space-y-2">
                              <div className="flex items-center justify-between">
                                <Badge variant="outline" className="capitalize">
                                  {provider.type}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(provider.created_at).toLocaleDateString()}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Client ID</span>
                                <span className="text-sm font-mono">
                                  {(provider as SocialProviderResponse).client_id || provider.clientId}
                                </span>
                              </div>
                              {provider.domain && (
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-muted-foreground">Domain</span>
                                  <span className="text-sm">{provider.domain}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {providers.length === 0 && !loading && (
                      <div className="text-sm text-muted-foreground py-4 text-center">
                        No identity providers configured
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* No User Pool Message */}
          {!hasAuthConfig && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Authentication
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  No User Pool configured for this project. Authentication is disabled or using legacy OAuth configuration.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Additional Config (if available) */}
          {config && Object.keys(config).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Additional Configuration</CardTitle>
                <CardDescription>Raw configuration data</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-64">
                  {JSON.stringify(config, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

