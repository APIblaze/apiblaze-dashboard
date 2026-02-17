'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertCircle, Plus, X, Users, Key, Copy, Check, Trash2, Search, ChevronDown, Star, ExternalLink, Loader2, Pencil } from 'lucide-react';
import { ProjectConfig, SocialProvider } from './types';
import { useState, useEffect, useRef, useMemo } from 'react';
import { AuthConfigModal } from '@/components/auth-config/auth-config-modal';
import { api } from '@/lib/api';
import { updateProjectConfig } from '@/lib/api/projects';
import { useDashboardCacheStore } from '@/store/dashboard-cache';
import type { AppClient, AuthConfig, SocialProvider as AuthConfigSocialProvider } from '@/types/auth-config';
import type { Project } from '@/types/project';

// API response may have snake_case fields from the database
type AppClientResponse = AppClient & {
  client_id?: string;
  authorized_callback_urls?: string[];
  signout_uris?: string[];
};

type SocialProviderResponse = AuthConfigSocialProvider & {
  client_id?: string;
};

interface AuthenticationSectionProps {
  config: ProjectConfig;
  updateConfig: (updates: Partial<ProjectConfig>) => void;
  isEditMode?: boolean;
  project?: Project | null;
  onProjectUpdate?: (updatedProject: Project) => void;
  teamId?: string;
}

const PROVIDER_DOMAINS: Record<SocialProvider, string> = {
  google: 'https://accounts.google.com',
  microsoft: 'https://login.microsoftonline.com',
  github: 'https://github.com',
  facebook: 'https://www.facebook.com',
  auth0: 'https://YOUR_DOMAIN.auth0.com',
  other: '',
};

const PROVIDER_TYPE_LABELS: Record<SocialProvider, string> = {
  google: 'Google',
  github: 'GitHub',
  microsoft: 'Microsoft',
  facebook: 'Facebook',
  auth0: 'Auth0',
  other: 'Other',
};

const PROVIDER_SETUP_GUIDES: Record<SocialProvider, string[]> = {
  google: [
    'Go to Google Cloud Console (console.cloud.google.com)',
    'Select your project or create a new one',
    'Go to APIs & Services → Library',
    'Search for and enable: Google+ API',
    'Go to APIs & Services → Credentials',
    'Click + CREATE CREDENTIALS → OAuth 2.0 Client IDs',
    'Choose Web application as application type',
    'Add the authorized redirect URI below',
    'Copy the Client ID and Client Secret',
  ],
  github: [
    'Go to GitHub Settings → Developer settings',
    'Click OAuth Apps → New OAuth App',
    'Fill in application name and homepage URL',
    'Add the authorization callback URL below',
    'Click Register application',
    'Copy the Client ID',
    'Generate a new client secret and copy it',
  ],
  microsoft: [
    'Go to Azure Portal (portal.azure.com)',
    'Navigate to Azure Active Directory',
    'Go to App registrations → New registration',
    'Enter application name and select account types',
    'Add redirect URI: Web → paste callback URL',
    'After creation, copy Application (client) ID',
    'Go to Certificates & secrets → New client secret',
    'Copy the client secret value',
  ],
  facebook: [
    'Go to Facebook Developers (developers.facebook.com)',
    'Create a new app or select existing one',
    'Add Facebook Login product',
    'Go to Settings → Basic',
    'Copy App ID and App Secret',
    'Go to Facebook Login → Settings',
    'Add Valid OAuth Redirect URIs',
  ],
  auth0: [
    'Go to Auth0 Dashboard (manage.auth0.com)',
    'Navigate to Applications → Create Application',
    'Choose Regular Web Application',
    'Go to Settings tab',
    'Copy Domain, Client ID, and Client Secret',
    'Add callback URL to Allowed Callback URLs',
    'Save changes',
  ],
  other: ['Configure your custom OAuth provider'],
};

// Edit Mode Management UI Component
function EditModeManagementUI({ 
  config, 
  updateConfig, 
  project,
  onProjectUpdate,
  initialAuthConfigId,
  teamId,
}: { 
  config: ProjectConfig; 
  updateConfig: (updates: Partial<ProjectConfig>) => void; 
  project?: Project | null;
  onProjectUpdate?: (updatedProject: Project) => void;
  initialAuthConfigId?: string;
  teamId?: string;
}) {
  const getAuthConfigs = useDashboardCacheStore((s) => s.getAuthConfigs);
  const getAuthConfig = useDashboardCacheStore((s) => s.getAuthConfig);
  const getAppClients = useDashboardCacheStore((s) => s.getAppClients);
  const getAppClient = useDashboardCacheStore((s) => s.getAppClient);
  const getProviders = useDashboardCacheStore((s) => s.getProviders);
  const getProvidersError = useDashboardCacheStore((s) => s.getProvidersError);
  const fetchAppClientsForConfig = useDashboardCacheStore((s) => s.fetchAppClientsForConfig);
  const fetchProvidersForClient = useDashboardCacheStore((s) => s.fetchProvidersForClient);
  const clearProvidersForRetry = useDashboardCacheStore((s) => s.clearProvidersForRetry);
  const isBootstrapping = useDashboardCacheStore((s) => s.isBootstrapping);
  const invalidateAndRefetch = useDashboardCacheStore((s) => s.invalidateAndRefetch);
  // Save config changes immediately to backend (without redeployment)
  const saveConfigImmediately = async (updates: Partial<ProjectConfig>) => {
    if (!project) return; // Only save if we're in edit mode with an existing project
    
    try {
      // Extract fields to save (defaultAppClient)
      const configToSave: Record<string, unknown> = {};
      if ('defaultAppClient' in updates) {
        configToSave.default_app_client_id = updates.defaultAppClient || null;
      }
      
      if (Object.keys(configToSave).length > 0) {
        await updateProjectConfig(project.project_id, project.api_version, configToSave);
        
        // Update the project object's config immediately so UI reflects the change
        const updatedConfig = project.config 
          ? { ...(project.config as Record<string, unknown>), ...configToSave }
          : configToSave;
        
        const updatedProject = {
          ...project,
          config: updatedConfig
        };
        
        // Notify parent to update project state
        if (onProjectUpdate) {
          onProjectUpdate(updatedProject);
        }
      }
    } catch (error) {
      console.error('Error saving config immediately:', error);
      // Don't show error to user - config will be saved on next deployment anyway
    }
  };

  // Get initial values from project config in edit mode - memoized to prevent recalculation
  const authConfigs = getAuthConfigs();
  const authConfigId = useMemo(() => {
    if (initialAuthConfigId) return initialAuthConfigId;
    if (config.authConfigId) return config.authConfigId;
    if (project?.config) {
      const projectConfig = project.config as Record<string, unknown>;
      const id = projectConfig.auth_config_id as string | undefined;
      if (id) return id;
    }
    if (authConfigs.length === 1) return authConfigs[0].id;
    return undefined;
  }, [initialAuthConfigId, config.authConfigId, project?.config, authConfigs]);

  const [selectedAuthConfigId, setSelectedAuthConfigId] = useState<string | undefined>(authConfigId);
  const currentAuthConfigId = authConfigId || selectedAuthConfigId;
  const appClients = currentAuthConfigId ? getAppClients(currentAuthConfigId) : [];
  const loadingAppClients = isBootstrapping && !!currentAuthConfigId;

  const providers = useMemo(() => {
    const result: Record<string, SocialProviderResponse[]> = {};
    if (!currentAuthConfigId) return result;
    for (const client of appClients) {
      const list = getProviders(currentAuthConfigId, client.id);
      if (list.length) result[client.id] = list as SocialProviderResponse[];
    }
    return result;
  }, [currentAuthConfigId, appClients, getProviders]);

  useEffect(() => {
    if (authConfigId && authConfigId !== selectedAuthConfigId) {
      setSelectedAuthConfigId(authConfigId);
    }
  }, [authConfigId, selectedAuthConfigId]);

  useEffect(() => {
    if (!isBootstrapping && currentAuthConfigId) {
      fetchAppClientsForConfig(currentAuthConfigId);
    }
  }, [currentAuthConfigId, isBootstrapping, fetchAppClientsForConfig]);

  useEffect(() => {
    if (!isBootstrapping && currentAuthConfigId) {
      for (const client of appClients) {
        fetchProvidersForClient(currentAuthConfigId, client.id);
      }
    }
  }, [currentAuthConfigId, appClients, isBootstrapping, fetchProvidersForClient]);

  const [appClientDetails, setAppClientDetails] = useState<Record<string, AppClientResponse>>({});
  const [loadingAppClientDetails, setLoadingAppClientDetails] = useState<Record<string, boolean>>({});
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});
  const [loadingSecret, setLoadingSecret] = useState<string | null>(null);
  const [showAddAppClient, setShowAddAppClient] = useState(false);
  const [newAppClientName, setNewAppClientName] = useState('');
  const [authorizedCallbackUrls, setAuthorizedCallbackUrls] = useState<string[]>(() => {
    const projectName = config.projectName || project?.project_id || 'project';
    const apiVersion = config.apiVersion || '1.0.0';
    return [`https://${projectName}.portal.apiblaze.com/${apiVersion}`];
  });
  const [newAuthorizedCallbackUrl, setNewAuthorizedCallbackUrl] = useState('');
  const [showAddProvider, setShowAddProvider] = useState<Record<string, boolean>>({});
  const [newProvider, setNewProvider] = useState<Record<string, {
    type: SocialProvider;
    clientId: string;
    clientSecret: string;
    domain: string;
    tokenType: 'apiblaze' | 'thirdParty';
    targetServerToken?: 'apiblaze' | 'third_party_access_token' | 'third_party_id_token' | 'none';
    includeApiblazeAccessTokenHeader?: boolean;
    includeApiblazeIdTokenHeader?: boolean;
  }>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<Record<string, boolean>>({});
  const [expiryValues, setExpiryValues] = useState<Record<string, {
    accessTokenExpiry: number;
    refreshTokenExpiry: number;
    idTokenExpiry: number;
  }>>({});
  const [newCallbackUrlByClient, setNewCallbackUrlByClient] = useState<Record<string, string>>({});
  const [savingCallbackUrlsForClient, setSavingCallbackUrlsForClient] = useState<string | null>(null);
  const [editingAppClientId, setEditingAppClientId] = useState<string | null>(null);
  const [editAppClientForm, setEditAppClientForm] = useState<{
    name: string;
    authorizedCallbackUrls: string[];
    newUrl: string;
    refreshTokenExpiry: number;
    idTokenExpiry: number;
    accessTokenExpiry: number;
    signoutUris: string[];
    newSignoutUri: string;
    scopes: string[];
    newScope: string;
  } | null>(null);
  const [savingAppClientEdit, setSavingAppClientEdit] = useState(false);
  const [editingProviderKey, setEditingProviderKey] = useState<string | null>(null);
  const [editProviderForm, setEditProviderForm] = useState<{
    type: SocialProvider;
    clientId: string;
    clientSecret: string;
    domain: string;
    tokenType: 'apiblaze' | 'thirdParty';
    targetServerToken: 'apiblaze' | 'third_party_access_token' | 'third_party_id_token' | 'none';
    includeApiblazeAccessTokenHeader: boolean;
    includeApiblazeIdTokenHeader: boolean;
  } | null>(null);
  const [savingProviderEdit, setSavingProviderEdit] = useState(false);
  const [loadingProviderSecret, setLoadingProviderSecret] = useState(false);

  const validateHttpsUrlForEdit = (url: string): { valid: boolean; error?: string } => {
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

  const getClientCallbackUrls = (clientId: string): string[] => {
    const detail = appClientDetails[clientId] as AppClientResponse | undefined;
    return (detail?.authorizedCallbackUrls ?? detail?.authorized_callback_urls ?? []) as string[];
  };

  const addCallbackUrlForClient = async (clientId: string) => {
    const url = (newCallbackUrlByClient[clientId] ?? '').trim();
    if (!url) return;
    const current = getClientCallbackUrls(clientId);
    if (current.includes(url)) {
      alert('This URL is already in the list');
      return;
    }
    const validation = validateHttpsUrlForEdit(url);
    if (!validation.valid) {
      alert(validation.error || 'Invalid URL');
      return;
    }
    if (!currentAuthConfigId || !teamId) return;
    setSavingCallbackUrlsForClient(clientId);
    try {
      await api.updateAppClient(currentAuthConfigId, clientId, {
        authorizedCallbackUrls: [...current, url],
      });
      setNewCallbackUrlByClient(prev => ({ ...prev, [clientId]: '' }));
      await invalidateAndRefetch(teamId);
    } catch (err) {
      console.error('Error adding callback URL:', err);
      alert('Failed to add callback URL');
    } finally {
      setSavingCallbackUrlsForClient(null);
    }
  };

  const removeCallbackUrlForClient = async (clientId: string, urlToRemove: string) => {
    const current = getClientCallbackUrls(clientId);
    const next = current.filter(u => u !== urlToRemove);
    if (!currentAuthConfigId || !teamId) return;
    setSavingCallbackUrlsForClient(clientId);
    try {
      await api.updateAppClient(currentAuthConfigId, clientId, {
        authorizedCallbackUrls: next,
      });
      await invalidateAndRefetch(teamId);
    } catch (err) {
      console.error('Error removing callback URL:', err);
      alert('Failed to remove callback URL');
    } finally {
      setSavingCallbackUrlsForClient(null);
    }
  };

  // Sync config from auth config when we have a single one
  useEffect(() => {
    if (!currentAuthConfigId) return;
    const ac = getAuthConfig(currentAuthConfigId);
    if (ac) {
      updateConfig({ 
        authConfigId: currentAuthConfigId, 
        useAuthConfig: true,
        userGroupName: ac.name,
        enableSocialAuth: true,
        bringOwnProvider: ac.bringMyOwnOAuth ?? false,
      });
    }
  }, [currentAuthConfigId, getAuthConfig, updateConfig]);

  // Helper functions
  const secondsToDaysAndMinutes = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const remainingSeconds = seconds % 86400;
    const minutes = Math.floor(remainingSeconds / 60);
    return { days, minutes };
  };
  
  const daysAndMinutesToSeconds = (days: number, minutes: number) => {
    return (days * 86400) + (minutes * 60);
  };

  // Sync app client details from cache for display (expiry, etc.)
  useEffect(() => {
    if (!currentAuthConfigId) return;
    const next: Record<string, AppClientResponse> = {};
    const nextExpiry: Record<string, { accessTokenExpiry: number; refreshTokenExpiry: number; idTokenExpiry: number }> = {};
    for (const client of appClients) {
      const detail = getAppClient(currentAuthConfigId, client.id);
      if (detail) {
        const c = detail as AppClientResponse;
        next[client.id] = c;
        nextExpiry[client.id] = {
          accessTokenExpiry: c.accessTokenExpiry ?? 3600,
          refreshTokenExpiry: c.refreshTokenExpiry ?? 2592000,
          idTokenExpiry: c.idTokenExpiry ?? 3600,
        };
      }
    }
    setAppClientDetails(next);
    setExpiryValues(prev => ({ ...prev, ...nextExpiry }));
  }, [currentAuthConfigId, appClients, getAppClient]);

  const revealClientSecret = async (authConfigId: string, clientId: string) => {
    setLoadingSecret(clientId);
    try {
      // Fetch the app client - the API should now return the secret
      const client = await api.getAppClient(authConfigId, clientId);
      const secret = client.clientSecret;
      
      if (secret) {
        setRevealedSecrets(prev => ({
          ...prev,
          [clientId]: secret
        }));
        // Also update appClientDetails
        setAppClientDetails(prev => ({
          ...prev,
          [clientId]: {
            ...client,
            clientSecret: secret
          } as AppClientResponse
        }));
      } else {
        console.error('Secret not found in API response:', client);
        alert('Secret not available. Please check the backend API response.');
      }
    } catch (error) {
      console.error('Error revealing client secret:', error);
      alert('Failed to retrieve client secret. Please check the console for details.');
    } finally {
      setLoadingSecret(null);
    }
  };


  const validateHttpsUrl = (url: string): { valid: boolean; error?: string } => {
    try {
      const urlObj = new URL(url);
      if (urlObj.protocol !== 'https:') {
        return { valid: false, error: 'URL must use HTTPS protocol' };
      }
      return { valid: true };
    } catch (error) {
      return { valid: false, error: 'Invalid URL format' };
    }
  };

  const addAuthorizedCallbackUrl = () => {
    const url = newAuthorizedCallbackUrl.trim();
    if (!url) return;

    if (authorizedCallbackUrls.includes(url)) {
      alert('This URL is already in the list');
      return;
    }

    const validation = validateHttpsUrl(url);
    if (!validation.valid) {
      alert(validation.error || 'Invalid URL');
      return;
    }

    setAuthorizedCallbackUrls([...authorizedCallbackUrls, url]);
    setNewAuthorizedCallbackUrl('');
  };

  const removeAuthorizedCallbackUrl = (url: string) => {
    setAuthorizedCallbackUrls(authorizedCallbackUrls.filter((u) => u !== url));
  };

  const handleCreateAppClient = async () => {
    if (!selectedAuthConfigId || !newAppClientName.trim()) return;
    
    // Generate default callback URL from project name
    const projectName = config.projectName || project?.project_id || 'project';
    const apiVersion = config.apiVersion || '1.0.0';
    const defaultCallbackUrl = `https://${projectName}.portal.apiblaze.com/${apiVersion}`;
    
    // Ensure default URL is included and is first
    const callbackUrls = authorizedCallbackUrls.length > 0 
      ? authorizedCallbackUrls 
      : [defaultCallbackUrl];
    
    // Make sure default URL is first if it's not already
    const finalCallbackUrls = callbackUrls.includes(defaultCallbackUrl)
      ? [defaultCallbackUrl, ...callbackUrls.filter(u => u !== defaultCallbackUrl)]
      : [defaultCallbackUrl, ...callbackUrls];
    
    try {
      const newClient = await api.createAppClient(selectedAuthConfigId, {
        name: newAppClientName,
        scopes: ['email', 'openid', 'profile'],
        authorizedCallbackUrls: finalCallbackUrls,
        projectName: config.projectName || project?.project_id || 'project',
        apiVersion: config.apiVersion || project?.api_version || '1.0.0',
      });
      
      // Add the new client to the state immediately so it appears right away
      // The API should return a full AppClient object
      const clientToAdd = newClient as AppClient;
      const clientId = clientToAdd.id;
      await invalidateAndRefetch(teamId);
      if (appClients.length === 0 || !config.defaultAppClient) {
        updateConfig({ defaultAppClient: clientId });
        await saveConfigImmediately({ defaultAppClient: clientId });
      }
      setNewAppClientName('');
      setAuthorizedCallbackUrls([]);
      setNewAuthorizedCallbackUrl('');
      setShowAddAppClient(false);
    } catch (error) {
      console.error('Error creating app client:', error);
      alert('Failed to create app client');
    }
  };

  const handleUpdateAppClientExpiries = async (clientId: string) => {
    if (!selectedAuthConfigId) return;
    
    const expiries = expiryValues[clientId];
    if (!expiries) return;
    
    try {
      // Values are already in seconds, send directly to API
      await api.updateAppClient(selectedAuthConfigId, clientId, {
        accessTokenExpiry: expiries.accessTokenExpiry,
        refreshTokenExpiry: expiries.refreshTokenExpiry,
        idTokenExpiry: expiries.idTokenExpiry,
      });
      
      await invalidateAndRefetch(teamId);
    } catch (error) {
      console.error('Error updating app client expiries:', error);
      alert('Failed to update token expiries');
    }
  };

  const handleDeleteAppClient = async (clientId: string) => {
    if (!selectedAuthConfigId) return;
    if (!confirm('Are you sure you want to delete this AppClient? This action cannot be undone.')) return;
    
    try {
      const wasDefault = config.defaultAppClient === clientId;
      await api.deleteAppClient(selectedAuthConfigId, clientId);
      await invalidateAndRefetch(teamId);
      const remainingClients = currentAuthConfigId ? getAppClients(currentAuthConfigId) : [];
      if (wasDefault && remainingClients.length > 0) {
        const newDefault = remainingClients[0].id;
        updateConfig({ defaultAppClient: newDefault });
        await saveConfigImmediately({ defaultAppClient: newDefault });
      } else if (wasDefault && remainingClients.length === 0) {
        updateConfig({ defaultAppClient: undefined });
        await saveConfigImmediately({ defaultAppClient: undefined });
      } else if (remainingClients.length === 1 && !config.defaultAppClient) {
        const newDefault = remainingClients[0].id;
        updateConfig({ defaultAppClient: newDefault });
        await saveConfigImmediately({ defaultAppClient: newDefault });
      }
    } catch (error) {
      console.error('Error deleting app client:', error);
      alert('Failed to delete app client');
    }
  };

  const handleAddProvider = async (clientId: string) => {
    if (!selectedAuthConfigId) return;
    const provider = newProvider[clientId] ?? {
      type: 'google' as SocialProvider,
      clientId: '',
      clientSecret: '',
      domain: PROVIDER_DOMAINS.google,
      tokenType: 'apiblaze' as const,
      targetServerToken: 'apiblaze' as const,
      includeApiblazeAccessTokenHeader: false,
      includeApiblazeIdTokenHeader: false,
    };
    if (!provider.clientId || !provider.clientSecret) {
      alert('Please provide Client ID and Client Secret');
      return;
    }
    
    try {
      await api.addProvider(selectedAuthConfigId, clientId, {
        type: provider.type,
        clientId: provider.clientId,
        clientSecret: provider.clientSecret,
        domain: provider.domain || PROVIDER_DOMAINS[provider.type],
        tokenType: provider.tokenType || 'apiblaze',
        targetServerToken: provider.targetServerToken ?? 'apiblaze',
        includeApiblazeAccessTokenHeader: provider.includeApiblazeAccessTokenHeader ?? (provider as { include_apiblaze_access_token_header?: boolean }).include_apiblaze_access_token_header ?? (provider as { include_apiblaze_token_header?: boolean }).include_apiblaze_token_header ?? false,
        includeApiblazeIdTokenHeader: provider.includeApiblazeIdTokenHeader ?? (provider as { include_apiblaze_id_token_header?: boolean }).include_apiblaze_id_token_header ?? false,
      });
      
      await invalidateAndRefetch(teamId);
      setNewProvider(prev => {
        const next = { ...prev };
        delete next[clientId];
        return next;
      });
      setShowAddProvider(prev => ({ ...prev, [clientId]: false }));
    } catch (error) {
      console.error('Error adding provider:', error);
      alert('Failed to add provider');
    }
  };

  const handleDeleteProvider = async (clientId: string, providerId: string) => {
    if (!selectedAuthConfigId) return;
    if (!confirm('Are you sure you want to delete this provider?')) return;
    
    try {
      await api.removeProvider(selectedAuthConfigId, clientId, providerId);
      await invalidateAndRefetch(teamId);
    } catch (error) {
      console.error('Error deleting provider:', error);
      alert('Failed to delete provider');
    }
  };

  const startEditAppClient = (client: AppClient) => {
    const details = appClientDetails[client.id] as AppClientResponse | undefined;
    const urls = (details?.authorizedCallbackUrls ?? details?.authorized_callback_urls ?? []) as string[];
    setEditingAppClientId(client.id);
    setEditAppClientForm({
      name: client.name,
      authorizedCallbackUrls: urls,
      newUrl: '',
      refreshTokenExpiry: details?.refreshTokenExpiry ?? 2592000,
      idTokenExpiry: details?.idTokenExpiry ?? 3600,
      accessTokenExpiry: details?.accessTokenExpiry ?? 3600,
      signoutUris: (details?.signoutUris ?? details?.signout_uris ?? []) as string[],
      newSignoutUri: '',
      scopes: (details?.scopes ?? ['email', 'openid', 'profile']) as string[],
      newScope: '',
    });
  };

  const saveAppClientEdit = async () => {
    if (!currentAuthConfigId || !editingAppClientId || !editAppClientForm) return;
    if (!editAppClientForm.name.trim()) {
      alert('Name is required');
      return;
    }
    setSavingAppClientEdit(true);
    try {
      await api.updateAppClient(currentAuthConfigId, editingAppClientId, {
        name: editAppClientForm.name.trim(),
        authorizedCallbackUrls: editAppClientForm.authorizedCallbackUrls,
        refreshTokenExpiry: editAppClientForm.refreshTokenExpiry,
        idTokenExpiry: editAppClientForm.idTokenExpiry,
        accessTokenExpiry: editAppClientForm.accessTokenExpiry,
        signoutUris: editAppClientForm.signoutUris,
        scopes: editAppClientForm.scopes,
      });
      await invalidateAndRefetch(teamId);
      setEditingAppClientId(null);
      setEditAppClientForm(null);
    } catch (err) {
      console.error('Error updating app client:', err);
      alert(err instanceof Error ? err.message : 'Failed to update app client');
    } finally {
      setSavingAppClientEdit(false);
    }
  };

  const cancelAppClientEdit = () => {
    setEditingAppClientId(null);
    setEditAppClientForm(null);
  };

  const startEditProvider = async (clientId: string, provider: SocialProviderResponse) => {
    setEditingProviderKey(`${clientId}:${provider.id}`);
    setLoadingProviderSecret(true);
    let secret = '';
    try {
      const res = await api.getProviderSecret(currentAuthConfigId!, clientId, provider.id);
      secret = res.clientSecret ?? '';
    } catch {
      // Leave empty if we can't fetch
    } finally {
      setLoadingProviderSecret(false);
    }
    setEditProviderForm({
      type: provider.type,
      clientId: provider.clientId ?? (provider as { client_id?: string }).client_id ?? '',
      clientSecret: secret,
      domain: provider.domain ?? PROVIDER_DOMAINS[provider.type],
      tokenType: ((provider.tokenType ?? (provider as { token_type?: string }).token_type) ?? 'apiblaze') as 'apiblaze' | 'thirdParty',
      targetServerToken: (provider.targetServerToken ?? (provider as { target_server_token?: string }).target_server_token ?? 'apiblaze') as 'apiblaze' | 'third_party_access_token' | 'third_party_id_token' | 'none',
      includeApiblazeAccessTokenHeader: provider.includeApiblazeAccessTokenHeader ?? (provider as { include_apiblaze_access_token_header?: boolean }).include_apiblaze_access_token_header ?? (provider as { include_apiblaze_token_header?: boolean }).include_apiblaze_token_header ?? false,
      includeApiblazeIdTokenHeader: provider.includeApiblazeIdTokenHeader ?? (provider as { include_apiblaze_id_token_header?: boolean }).include_apiblaze_id_token_header ?? false,
    });
  };

  const saveProviderEdit = async () => {
    if (!currentAuthConfigId || !editingProviderKey || !editProviderForm) return;
    const [clientId, providerId] = editingProviderKey.split(':');
    if (!editProviderForm.clientId.trim() || !editProviderForm.clientSecret.trim()) {
      alert('Client ID and Client Secret are required');
      return;
    }
    setSavingProviderEdit(true);
    try {
      await api.updateProvider(currentAuthConfigId, clientId, providerId, {
        type: editProviderForm.type,
        clientId: editProviderForm.clientId.trim(),
        clientSecret: editProviderForm.clientSecret.trim(),
        domain: editProviderForm.domain.trim() || undefined,
        tokenType: editProviderForm.tokenType,
        targetServerToken: editProviderForm.targetServerToken,
        includeApiblazeAccessTokenHeader: editProviderForm.includeApiblazeAccessTokenHeader,
        includeApiblazeIdTokenHeader: editProviderForm.includeApiblazeIdTokenHeader,
      });
      await invalidateAndRefetch(teamId);
      setEditingProviderKey(null);
      setEditProviderForm(null);
    } catch (err) {
      console.error('Error updating provider:', err);
      alert(err instanceof Error ? err.message : 'Failed to update provider');
    } finally {
      setSavingProviderEdit(false);
    }
  };

  const cancelProviderEdit = () => {
    setEditingProviderKey(null);
    setEditProviderForm(null);
  };

  const copyToClipboard = async (text: string, field: string) => {
    if (!text || text.trim() === '') {
      console.warn('No text to copy');
      return;
    }

    try {
      // Check if clipboard API is available (requires secure context)
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
        return;
      }
    } catch (clipboardError) {
      console.warn('Clipboard API failed, trying fallback:', clipboardError);
    }

    // Fallback for browsers/environments without clipboard API
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      textArea.style.opacity = '0';
      textArea.setAttribute('readonly', '');
      textArea.setAttribute('aria-hidden', 'true');
      document.body.appendChild(textArea);
      
      // For iOS
      if (navigator.userAgent.match(/ipad|iphone/i)) {
        const range = document.createRange();
        range.selectNodeContents(textArea);
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
        }
        textArea.setSelectionRange(0, 999999);
      } else {
        textArea.focus();
        textArea.select();
        textArea.setSelectionRange(0, text.length);
      }
      
      const successful = document.execCommand('copy');
      
      // Clean up
      if (textArea.parentNode) {
        document.body.removeChild(textArea);
      }
      
      if (successful) {
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
      } else {
        throw new Error('Copy command returned false');
      }
    } catch (fallbackError) {
      console.error('Fallback copy failed:', fallbackError);
      // Last resort: show value in prompt for manual copy
      const userConfirmed = confirm(`Copy this value manually:\n\n${text}\n\nClick OK to continue.`);
      if (userConfirmed) {
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
      }
    }
  };

  const currentAuthConfigIdForLoading = authConfigId || selectedAuthConfigId;
  const isLoadingInitialData = isBootstrapping && !!currentAuthConfigIdForLoading && appClients.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <Label className="text-base font-semibold">OAuth Configuration</Label>
        <p className="text-sm text-muted-foreground">
          Manage AppClients and Providers for this project. The AuthConfig is selected via the &quot;Auth Config Name&quot; field above.
        </p>
      </div>

      {/* Simple Loading Indicator */}
      {isLoadingInitialData && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading authentication configuration...</span>
        </div>
      )}

      {/* AppClient Management */}
      {selectedAuthConfigId && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">AppClients</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddAppClient(!showAddAppClient)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add AppClient
            </Button>
          </div>

          {showAddAppClient && (
            <Card className="border-blue-200 bg-blue-50/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Create New AppClient</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label htmlFor="appClientName" className="text-xs">Name</Label>
                  <Input
                    id="appClientName"
                    value={newAppClientName}
                    onChange={(e) => setNewAppClientName(e.target.value)}
                    placeholder="my-app-client"
                    className="mt-1"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Authorized Callback URLs</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newAuthorizedCallbackUrl}
                      onChange={(e) => setNewAuthorizedCallbackUrl(e.target.value)}
                      placeholder="https://example.com/callback"
                      className="text-xs"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addAuthorizedCallbackUrl();
                        }
                      }}
                    />
                    <Button type="button" size="sm" onClick={addAuthorizedCallbackUrl}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {authorizedCallbackUrls.map((url, index) => (
                      <div
                        key={url}
                        className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs"
                      >
                        {index === 0 && (
                          <Badge variant="secondary" className="mr-1 text-xs">
                            <Star className="h-2 w-2 mr-1" />
                            Default
                          </Badge>
                        )}
                        <span>{url}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-4 w-4 p-0"
                          onClick={() => removeAuthorizedCallbackUrl(url)}
                        >
                          <X className="h-2 w-2" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleCreateAppClient}
                    disabled={!newAppClientName.trim()}
                  >
                    Create
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowAddAppClient(false);
                      setNewAppClientName('');
                      setAuthorizedCallbackUrls([]);
                      setNewAuthorizedCallbackUrl('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {loadingAppClients && appClients.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">Loading AppClients...</div>
          ) : appClients.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">No AppClients found. Create one to continue.</div>
          ) : (
            <div className="space-y-6">
              {appClients.map((client) => {
                const clientDetails = appClientDetails[client.id];
                const clientProviders = providers[client.id] || [];
                const providersError = currentAuthConfigId
                  ? getProvidersError(currentAuthConfigId, client.id)
                  : null;
                const isLoadingProviders = false;
                const isShowingAddProvider = showAddProvider[client.id];
                return (
                  <div key={client.id} className="space-y-4">
                    {/* App Client Card - Inline edit form when editing */}
                    {editingAppClientId === client.id && editAppClientForm ? (
                      <Card className="border-2 border-blue-200 bg-blue-50/50">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">Edit AppClient</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div>
                            <Label htmlFor={`editAppClientName-${client.id}`} className="text-xs">Name</Label>
                            <Input
                              id={`editAppClientName-${client.id}`}
                              value={editAppClientForm.name}
                              onChange={(e) => setEditAppClientForm(prev => prev ? { ...prev, name: e.target.value } : null)}
                              placeholder="my-app-client"
                              className="mt-1"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">Authorized Callback URLs</Label>
                            <div className="flex gap-2">
                              <Input
                                value={editAppClientForm.newUrl}
                                onChange={(e) => setEditAppClientForm(prev => prev ? { ...prev, newUrl: e.target.value } : null)}
                                placeholder="https://example.com/callback"
                                className="text-xs"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (editAppClientForm.newUrl.trim()) {
                                      setEditAppClientForm(prev => prev ? { ...prev, authorizedCallbackUrls: [...prev.authorizedCallbackUrls, prev.newUrl.trim()], newUrl: '' } : null);
                                    }
                                  }
                                }}
                              />
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                  if (editAppClientForm.newUrl.trim()) {
                                    setEditAppClientForm(prev => prev ? { ...prev, authorizedCallbackUrls: [...prev.authorizedCallbackUrls, prev.newUrl.trim()], newUrl: '' } : null);
                                  }
                                }}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {editAppClientForm.authorizedCallbackUrls.map((url, index) => (
                                <div key={url} className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs">
                                  {index === 0 && (
                                    <Badge variant="secondary" className="mr-1 text-xs">
                                      <Star className="h-2 w-2 mr-1" />
                                      Default
                                    </Badge>
                                  )}
                                  <span>{url}</span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-4 w-4 p-0"
                                    onClick={() => setEditAppClientForm(prev => prev ? { ...prev, authorizedCallbackUrls: prev.authorizedCallbackUrls.filter(u => u !== url) } : null)}
                                  >
                                    <X className="h-2 w-2" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="pt-2 border-t border-blue-100">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowAdvancedSettings(prev => ({ ...prev, [client.id]: !prev[client.id] }))}
                              className="w-full justify-between h-8 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-blue-50"
                            >
                              <span className="flex items-center gap-2">
                                <ChevronDown className={`h-3 w-3 transition-transform ${showAdvancedSettings[client.id] ? 'rotate-180' : ''}`} />
                                Advanced Settings
                              </span>
                            </Button>
                            {showAdvancedSettings[client.id] && (
                              <div className="space-y-2 mt-3">
                                <Label className="text-xs">Token Expiry (seconds)</Label>
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Refresh</Label>
                                    <Input
                                      type="number"
                                      value={editAppClientForm.refreshTokenExpiry}
                                      onChange={(e) => setEditAppClientForm(prev => prev ? { ...prev, refreshTokenExpiry: parseInt(e.target.value, 10) || 2592000 } : null)}
                                      className="mt-1"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">ID Token</Label>
                                    <Input
                                      type="number"
                                      value={editAppClientForm.idTokenExpiry}
                                      onChange={(e) => setEditAppClientForm(prev => prev ? { ...prev, idTokenExpiry: parseInt(e.target.value, 10) || 3600 } : null)}
                                      className="mt-1"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Access</Label>
                                    <Input
                                      type="number"
                                      value={editAppClientForm.accessTokenExpiry}
                                      onChange={(e) => setEditAppClientForm(prev => prev ? { ...prev, accessTokenExpiry: parseInt(e.target.value, 10) || 3600 } : null)}
                                      className="mt-1"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              onClick={saveAppClientEdit}
                              disabled={savingAppClientEdit || !editAppClientForm.name.trim()}
                            >
                              {savingAppClientEdit ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                              Save
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={cancelAppClientEdit}>
                              Cancel
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                    <Card className="border-2 border-blue-200 bg-blue-50/30 shadow-sm">
                      <CardContent className="p-4">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Key className="h-4 w-4 text-blue-600" />
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-base">{client.name}</span>
                                  <div className="flex items-center gap-1.5">
                                    {config.defaultAppClient === client.id && (
                                      <Badge variant="default" className="bg-yellow-500 hover:bg-yellow-600 text-xs">
                                        <Star className="h-3 w-3 mr-1" />
                                        Default
                                      </Badge>
                                    )}
                                    {(clientDetails?.verified ?? client?.verified) === false ? (
                                      <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-xs">
                                        Unverified
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 text-xs">
                                        Verified
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                {/* JWKS Display - shown for all app clients (client_id from list) */}
                                {(() => {
                                  const clientId = clientDetails?.client_id || clientDetails?.clientId || client.clientId || client.id;
                                  if (!clientId) return null;
                                  const jwksUrl = `https://auth.apiblaze.com/${clientId}/.well-known/jwks.json`;
                                  return (
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <div className="text-xs text-muted-foreground">
                                        JWKS (RS256 Public Key):{' '}
                                        <a
                                          href={jwksUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-blue-600 hover:text-blue-800 underline"
                                        >
                                          {jwksUrl}
                                        </a>
                                      </div>
                                      <a
                                        href={jwksUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:text-blue-800"
                                        title="Open JWKS in new tab"
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    </div>
                                  );
                                })()}
                                {(() => {
                                  const clientId = clientDetails?.client_id || clientDetails?.clientId;
                                  const projectName = project?.project_id || 'project';
                                  const apiVersion = project?.api_version || '1.0.0';
                                  const isDefault = config.defaultAppClient === client.id;
                                  
                                  // Default app client: https://{projectName}.portal.apiblaze.com/{apiVersion}
                                  // Non-default: https://{projectName}.portal.apiblaze.com/{apiVersion}/login?clientId={clientId}
                                  const portalUrl = isDefault
                                    ? `https://${projectName}.portal.apiblaze.com/${apiVersion}`
                                    : clientId
                                      ? `https://${projectName}.portal.apiblaze.com/${apiVersion}/login?clientId=${clientId}`
                                      : `https://${projectName}.portal.apiblaze.com/${apiVersion}/login`;
                                  
                                  return (
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <div className="text-xs text-muted-foreground">
                                        API Portal login:{' '}
                                        <a
                                          href={portalUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-blue-600 hover:text-blue-800 underline"
                                        >
                                          {portalUrl}
                                        </a>
                                      </div>
                                      <a
                                        href={portalUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:text-blue-800"
                                        title="Open in new tab"
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                      {isDefault ? null : (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={async () => {
                                            updateConfig({
                                              defaultAppClient: client.id,
                                            });
                                            // Save immediately if in edit mode
                                            await saveConfigImmediately({ defaultAppClient: client.id });
                                          }}
                                          className="h-6 px-2 text-xs hover:bg-blue-100 ml-1"
                                          title="Set as default"
                                        >
                                          <Star className="h-3 w-3 mr-1" />
                                          Set as Default
                                        </Button>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {(clientDetails?.verified ?? client?.verified) === false && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={async () => {
                                      if (!selectedAuthConfigId) return;
                                      try {
                                        await api.updateAppClient(selectedAuthConfigId, client.id, { verified: true });
                                        await invalidateAndRefetch(teamId);
                                      } catch (err) {
                                        console.error('Failed to verify app client:', err);
                                        alert('Failed to verify app client');
                                      }
                                    }}
                                    className="h-8 text-xs"
                                    title="Mark as verified"
                                  >
                                    Verify
                                  </Button>
                                )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => startEditAppClient(client)}
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-blue-600 hover:bg-blue-50"
                                title="Edit app client"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteAppClient(client.id)}
                                className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          {clientDetails && (
                            <>
                            <div className="space-y-3 pt-2 border-t border-blue-100">
                              <div className="space-y-2">
                                <div>
                                  <Label className="text-xs font-medium text-muted-foreground">Client ID</Label>
                                  <div className="flex items-center gap-2 mt-1">
                                    <code className="flex-1 text-xs bg-white px-3 py-2 rounded-md border border-gray-200 font-mono break-all">
                                      {clientDetails.client_id || clientDetails.clientId || '••••••••'}
                                    </code>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        await copyToClipboard(clientDetails.client_id || clientDetails.clientId || '', `clientId-${client.id}`);
                                      }}
                                      className="h-8 w-8 p-0 hover:bg-blue-100"
                                    >
                                      {copiedField === `clientId-${client.id}` ? (
                                        <Check className="h-4 w-4 text-green-600" />
                                      ) : (
                                        <Copy className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </div>
                                </div>
                                <div>
                                  <Label className="text-xs font-medium text-muted-foreground">Client Secret</Label>
                                  <div className="flex items-center gap-2 mt-1">
                                    <code className="flex-1 text-xs bg-white px-3 py-2 rounded-md border border-gray-200 font-mono">
                                      {(() => {
                                        const secret = revealedSecrets[client.id] || 
                                                      (clientDetails as AppClientResponse).clientSecret;
                                        if (secret) {
                                          // Show first 4 and last 4 characters
                                          if (secret.length <= 8) {
                                            return secret; // Show full secret if it's short
                                          }
                                          return `${secret.substring(0, 4)}...${secret.substring(secret.length - 4)}`;
                                        }
                                        return '••••••••••••••••';
                                      })()}
                                    </code>
                                    {revealedSecrets[client.id] || 
                                     (clientDetails as AppClientResponse).clientSecret ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          const secret = revealedSecrets[client.id] || 
                                                        (clientDetails as AppClientResponse).clientSecret;
                                          if (secret) {
                                            await copyToClipboard(secret, `clientSecret-${client.id}`);
                                          }
                                        }}
                                        className="h-8 w-8 p-0 hover:bg-blue-100"
                                      >
                                        {copiedField === `clientSecret-${client.id}` ? (
                                          <Check className="h-4 w-4 text-green-600" />
                                        ) : (
                                          <Copy className="h-4 w-4" />
                                        )}
                                      </Button>
                                    ) : (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          if (selectedAuthConfigId) {
                                            revealClientSecret(selectedAuthConfigId, client.id);
                                          }
                                        }}
                                        className="h-8 px-3 text-xs hover:bg-blue-100"
                                        disabled={loadingSecret === client.id}
                                      >
                                        {loadingSecret === client.id ? '...' : 'Reveal'}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                {/* Authorized callback URLs - below Client Secret, before Advanced Settings (editable, same UX as create mode) */}
                                <div className="space-y-2">
                                  <Label className="text-xs font-medium text-muted-foreground">Authorized callback URLs</Label>
                                  <div className="flex gap-2">
                                    <Input
                                      value={newCallbackUrlByClient[client.id] ?? ''}
                                      onChange={(e) => setNewCallbackUrlByClient(prev => ({ ...prev, [client.id]: e.target.value }))}
                                      placeholder="https://example.com/callback"
                                      className="text-xs"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          addCallbackUrlForClient(client.id);
                                        }
                                      }}
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => addCallbackUrlForClient(client.id)}
                                      disabled={savingCallbackUrlsForClient === client.id}
                                    >
                                      {savingCallbackUrlsForClient === client.id ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Plus className="h-3 w-3" />
                                      )}
                                    </Button>
                                  </div>
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {getClientCallbackUrls(client.id).length === 0 ? (
                                      <p className="text-xs text-muted-foreground italic">None configured</p>
                                    ) : (
                                      getClientCallbackUrls(client.id).map((url: string, index: number) => (
                                        <div
                                          key={url}
                                          className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs"
                                        >
                                          {index === 0 && (
                                            <Badge variant="secondary" className="mr-1 text-xs">
                                              <Star className="h-2 w-2 mr-1" />
                                              Default
                                            </Badge>
                                          )}
                                          <span className="break-all">{url}</span>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-4 w-4 p-0 shrink-0"
                                            onClick={() => removeCallbackUrlForClient(client.id, url)}
                                            disabled={savingCallbackUrlsForClient === client.id}
                                          >
                                            <X className="h-2 w-2" />
                                          </Button>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              </div>
                              
                              {/* Advanced Settings - Expiry Configuration */}
                              <div className="pt-2 border-t border-blue-100">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setShowAdvancedSettings(prev => ({
                                    ...prev,
                                    [client.id]: !prev[client.id]
                                  }))}
                                  className="w-full justify-between h-8 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-blue-50"
                                >
                                  <span className="flex items-center gap-2">
                                    <ChevronDown className={`h-3 w-3 transition-transform ${showAdvancedSettings[client.id] ? 'rotate-180' : ''}`} />
                                    Advanced Settings
                                  </span>
                                </Button>
                                
                                {showAdvancedSettings[client.id] && (
                                  <div className="mt-3 space-y-4">
                                    {/* Access Token Expiry */}
                                    <div className="space-y-2">
                                      <Label className="text-xs font-medium">Access Token Expiry</Label>
                                      <div className="flex items-end gap-2">
                                        <div className="w-20">
                                          <Label htmlFor={`accessTokenDays-${client.id}`} className="text-xs text-muted-foreground">Days</Label>
                                          <Input
                                            id={`accessTokenDays-${client.id}`}
                                            type="number"
                                            value={(() => {
                                              const seconds = expiryValues[client.id]?.accessTokenExpiry || clientDetails?.accessTokenExpiry || 3600;
                                              return secondsToDaysAndMinutes(seconds).days;
                                            })()}
                                            onChange={(e) => {
                                              const days = parseInt(e.target.value) || 0;
                                              const currentSeconds = expiryValues[client.id]?.accessTokenExpiry || clientDetails?.accessTokenExpiry || 3600;
                                              const { minutes } = secondsToDaysAndMinutes(currentSeconds);
                                              const newSeconds = daysAndMinutesToSeconds(days, minutes);
                                              setExpiryValues(prev => ({
                                                ...prev,
                                                [client.id]: {
                                                  ...(prev[client.id] || {
                                                    accessTokenExpiry: clientDetails?.accessTokenExpiry || 3600,
                                                    refreshTokenExpiry: clientDetails?.refreshTokenExpiry || 2592000,
                                                    idTokenExpiry: clientDetails?.idTokenExpiry || 3600,
                                                  }),
                                                  accessTokenExpiry: newSeconds,
                                                }
                                              }));
                                            }}
                                            className="mt-1 text-xs"
                                            min="0"
                                          />
                                        </div>
                                        <span className="text-xs text-muted-foreground pb-2">and</span>
                                        <div className="w-20">
                                          <Label htmlFor={`accessTokenMinutes-${client.id}`} className="text-xs text-muted-foreground">Minutes</Label>
                                          <Input
                                            id={`accessTokenMinutes-${client.id}`}
                                            type="number"
                                            value={(() => {
                                              const seconds = expiryValues[client.id]?.accessTokenExpiry || clientDetails?.accessTokenExpiry || 3600;
                                              return secondsToDaysAndMinutes(seconds).minutes;
                                            })()}
                                            onChange={(e) => {
                                              const minutes = parseInt(e.target.value) || 0;
                                              const currentSeconds = expiryValues[client.id]?.accessTokenExpiry || clientDetails?.accessTokenExpiry || 3600;
                                              const { days } = secondsToDaysAndMinutes(currentSeconds);
                                              const newSeconds = daysAndMinutesToSeconds(days, minutes);
                                              setExpiryValues(prev => ({
                                                ...prev,
                                                [client.id]: {
                                                  ...(prev[client.id] || {
                                                    accessTokenExpiry: clientDetails?.accessTokenExpiry || 3600,
                                                    refreshTokenExpiry: clientDetails?.refreshTokenExpiry || 2592000,
                                                    idTokenExpiry: clientDetails?.idTokenExpiry || 3600,
                                                  }),
                                                  accessTokenExpiry: newSeconds,
                                                }
                                              }));
                                            }}
                                            className="mt-1 text-xs"
                                            min="0"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {/* Refresh Token Expiry */}
                                    <div className="space-y-2">
                                      <Label className="text-xs font-medium">Refresh Token Expiry</Label>
                                      <div className="flex items-end gap-2">
                                        <div className="w-20">
                                          <Label htmlFor={`refreshTokenDays-${client.id}`} className="text-xs text-muted-foreground">Days</Label>
                                          <Input
                                            id={`refreshTokenDays-${client.id}`}
                                            type="number"
                                            value={(() => {
                                              const seconds = expiryValues[client.id]?.refreshTokenExpiry || clientDetails?.refreshTokenExpiry || 2592000;
                                              return secondsToDaysAndMinutes(seconds).days;
                                            })()}
                                            onChange={(e) => {
                                              const days = parseInt(e.target.value) || 0;
                                              const currentSeconds = expiryValues[client.id]?.refreshTokenExpiry || clientDetails?.refreshTokenExpiry || 2592000;
                                              const { minutes } = secondsToDaysAndMinutes(currentSeconds);
                                              const newSeconds = daysAndMinutesToSeconds(days, minutes);
                                              setExpiryValues(prev => ({
                                                ...prev,
                                                [client.id]: {
                                                  ...(prev[client.id] || {
                                                    accessTokenExpiry: clientDetails?.accessTokenExpiry || 3600,
                                                    refreshTokenExpiry: clientDetails?.refreshTokenExpiry || 2592000,
                                                    idTokenExpiry: clientDetails?.idTokenExpiry || 3600,
                                                  }),
                                                  refreshTokenExpiry: newSeconds,
                                                }
                                              }));
                                            }}
                                            className="mt-1 text-xs"
                                            min="0"
                                          />
                                        </div>
                                        <span className="text-xs text-muted-foreground pb-2">and</span>
                                        <div className="w-20">
                                          <Label htmlFor={`refreshTokenMinutes-${client.id}`} className="text-xs text-muted-foreground">Minutes</Label>
                                          <Input
                                            id={`refreshTokenMinutes-${client.id}`}
                                            type="number"
                                            value={(() => {
                                              const seconds = expiryValues[client.id]?.refreshTokenExpiry || clientDetails?.refreshTokenExpiry || 2592000;
                                              return secondsToDaysAndMinutes(seconds).minutes;
                                            })()}
                                            onChange={(e) => {
                                              const minutes = parseInt(e.target.value) || 0;
                                              const currentSeconds = expiryValues[client.id]?.refreshTokenExpiry || clientDetails?.refreshTokenExpiry || 2592000;
                                              const { days } = secondsToDaysAndMinutes(currentSeconds);
                                              const newSeconds = daysAndMinutesToSeconds(days, minutes);
                                              setExpiryValues(prev => ({
                                                ...prev,
                                                [client.id]: {
                                                  ...(prev[client.id] || {
                                                    accessTokenExpiry: clientDetails?.accessTokenExpiry || 3600,
                                                    refreshTokenExpiry: clientDetails?.refreshTokenExpiry || 2592000,
                                                    idTokenExpiry: clientDetails?.idTokenExpiry || 3600,
                                                  }),
                                                  refreshTokenExpiry: newSeconds,
                                                }
                                              }));
                                            }}
                                            className="mt-1 text-xs"
                                            min="0"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {/* ID Token Expiry */}
                                    <div className="space-y-2">
                                      <Label className="text-xs font-medium">ID Token Expiry</Label>
                                      <div className="flex items-end gap-2">
                                        <div className="w-20">
                                          <Label htmlFor={`idTokenDays-${client.id}`} className="text-xs text-muted-foreground">Days</Label>
                                          <Input
                                            id={`idTokenDays-${client.id}`}
                                            type="number"
                                            value={(() => {
                                              const seconds = expiryValues[client.id]?.idTokenExpiry || clientDetails?.idTokenExpiry || 3600;
                                              return secondsToDaysAndMinutes(seconds).days;
                                            })()}
                                            onChange={(e) => {
                                              const days = parseInt(e.target.value) || 0;
                                              const currentSeconds = expiryValues[client.id]?.idTokenExpiry || clientDetails?.idTokenExpiry || 3600;
                                              const { minutes } = secondsToDaysAndMinutes(currentSeconds);
                                              const newSeconds = daysAndMinutesToSeconds(days, minutes);
                                              setExpiryValues(prev => ({
                                                ...prev,
                                                [client.id]: {
                                                  ...(prev[client.id] || {
                                                    accessTokenExpiry: clientDetails?.accessTokenExpiry || 3600,
                                                    refreshTokenExpiry: clientDetails?.refreshTokenExpiry || 2592000,
                                                    idTokenExpiry: clientDetails?.idTokenExpiry || 3600,
                                                  }),
                                                  idTokenExpiry: newSeconds,
                                                }
                                              }));
                                            }}
                                            className="mt-1 text-xs"
                                            min="0"
                                          />
                                        </div>
                                        <span className="text-xs text-muted-foreground pb-2">and</span>
                                        <div className="w-20">
                                          <Label htmlFor={`idTokenMinutes-${client.id}`} className="text-xs text-muted-foreground">Minutes</Label>
                                          <Input
                                            id={`idTokenMinutes-${client.id}`}
                                            type="number"
                                            value={(() => {
                                              const seconds = expiryValues[client.id]?.idTokenExpiry || clientDetails?.idTokenExpiry || 3600;
                                              return secondsToDaysAndMinutes(seconds).minutes;
                                            })()}
                                            onChange={(e) => {
                                              const minutes = parseInt(e.target.value) || 0;
                                              const currentSeconds = expiryValues[client.id]?.idTokenExpiry || clientDetails?.idTokenExpiry || 3600;
                                              const { days } = secondsToDaysAndMinutes(currentSeconds);
                                              const newSeconds = daysAndMinutesToSeconds(days, minutes);
                                              setExpiryValues(prev => ({
                                                ...prev,
                                                [client.id]: {
                                                  ...(prev[client.id] || {
                                                    accessTokenExpiry: clientDetails?.accessTokenExpiry || 3600,
                                                    refreshTokenExpiry: clientDetails?.refreshTokenExpiry || 2592000,
                                                    idTokenExpiry: clientDetails?.idTokenExpiry || 3600,
                                                  }),
                                                  idTokenExpiry: newSeconds,
                                                }
                                              }));
                                            }}
                                            className="mt-1 text-xs"
                                            min="0"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                    
                                    <div className="flex gap-2 pt-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        onClick={() => handleUpdateAppClientExpiries(client.id)}
                                        className="text-xs"
                                      >
                                        Save Changes
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          // Reset to original values from clientDetails
                                          if (clientDetails) {
                                            setExpiryValues(prev => ({
                                              ...prev,
                                              [client.id]: {
                                                accessTokenExpiry: clientDetails.accessTokenExpiry || 3600,
                                                refreshTokenExpiry: clientDetails.refreshTokenExpiry || 2592000,
                                                idTokenExpiry: clientDetails.idTokenExpiry || 3600,
                                              }
                                            }));
                                          }
                                        }}
                                        className="text-xs"
                                      >
                                        Reset
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                    )}
                    
                    {/* Providers nested under each app client - Clearly indented with visual connection */}
                    <div className="ml-8 pl-4 border-l-2 border-gray-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <Label className="text-sm font-medium text-muted-foreground">OAuth Providers</Label>
                          {clientProviders.length > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {clientProviders.length}
                            </Badge>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowAddProvider(prev => ({ ...prev, [client.id]: !prev[client.id] }))}
                          className="h-8 text-xs"
                        >
                          <Plus className="h-3 w-3 mr-1.5" />
                          Add Provider
                        </Button>
                      </div>

                      {isShowingAddProvider && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* Left Column - Configuration Fields */}
                          <Card className="border-green-200 bg-green-50/50">
                            <CardHeader className="pb-3">
                              <CardTitle className="text-sm">Add OAuth Provider</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              <div>
                                <Label htmlFor={`providerType-${client.id}`} className="text-xs">Provider Type</Label>
                                <Select
                                  value={newProvider[client.id]?.type || 'google'}
                                  onValueChange={(value) => setNewProvider(prev => ({
                                    ...prev,
                                    [client.id]: {
                                      type: value as SocialProvider,
                                      clientId: prev[client.id]?.clientId || '',
                                      clientSecret: prev[client.id]?.clientSecret || '',
                                      domain: PROVIDER_DOMAINS[value as SocialProvider],
                                      tokenType: prev[client.id]?.tokenType || 'apiblaze',
                                    }
                                  }))}
                                >
                                  <SelectTrigger className="mt-1">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="google">Google</SelectItem>
                                    <SelectItem value="microsoft">Microsoft</SelectItem>
                                    <SelectItem value="github">GitHub</SelectItem>
                                    <SelectItem value="facebook">Facebook</SelectItem>
                                    <SelectItem value="auth0">Auth0</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label htmlFor={`providerDomain-${client.id}`} className="text-xs">Domain</Label>
                                <Input
                                  id={`providerDomain-${client.id}`}
                                  value={newProvider[client.id]?.domain ?? PROVIDER_DOMAINS[newProvider[client.id]?.type || 'google']}
                                  onChange={(e) => setNewProvider(prev => ({
                                    ...prev,
                                    [client.id]: {
                                      ...(prev[client.id] || { type: 'google', clientId: '', clientSecret: '', domain: PROVIDER_DOMAINS.google, tokenType: 'apiblaze', targetServerToken: 'apiblaze', includeApiblazeAccessTokenHeader: false, includeApiblazeIdTokenHeader: false }),
                                      domain: e.target.value
                                    }
                                  }))}
                                  placeholder="https://accounts.google.com"
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label htmlFor={`providerClientId-${client.id}`} className="text-xs">Client ID</Label>
                                <Input
                                  id={`providerClientId-${client.id}`}
                                  value={newProvider[client.id]?.clientId || ''}
                                  onChange={(e) => setNewProvider(prev => ({
                                    ...prev,
                                    [client.id]: {
                                      ...(prev[client.id] || { type: 'google', clientId: '', clientSecret: '', domain: PROVIDER_DOMAINS.google, tokenType: 'apiblaze', targetServerToken: 'apiblaze', includeApiblazeAccessTokenHeader: false, includeApiblazeIdTokenHeader: false }),
                                      clientId: e.target.value
                                    }
                                  }))}
                                  placeholder="your-client-id"
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label htmlFor={`providerClientSecret-${client.id}`} className="text-xs">Client Secret</Label>
                                <Input
                                  id={`providerClientSecret-${client.id}`}
                                  type="password"
                                  value={newProvider[client.id]?.clientSecret || ''}
                                  onChange={(e) => setNewProvider(prev => ({
                                    ...prev,
                                    [client.id]: {
                                      ...(prev[client.id] || { type: 'google', clientId: '', clientSecret: '', domain: PROVIDER_DOMAINS.google, tokenType: 'apiblaze', targetServerToken: 'apiblaze', includeApiblazeAccessTokenHeader: false, includeApiblazeIdTokenHeader: false }),
                                      clientSecret: e.target.value
                                    }
                                  }))}
                                  placeholder="your-client-secret"
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label htmlFor={`providerTokenType-${client.id}`} className="text-xs">Client side token type</Label>
                                <p className="text-xs text-muted-foreground">
                                  {(newProvider[client.id]?.tokenType || 'apiblaze') === 'thirdParty'
                                    ? 'Tokens the API users will see and that will be forwarded to your target servers'
                                    : 'Tokens the API users will see'}
                                </p>
                                <Select
                                  value={newProvider[client.id]?.tokenType || 'apiblaze'}
                                  onValueChange={(value) => setNewProvider(prev => ({
                                    ...prev,
                                    [client.id]: {
                                      ...(prev[client.id] || { type: 'google', clientId: '', clientSecret: '', domain: PROVIDER_DOMAINS.google, tokenType: 'apiblaze', targetServerToken: 'apiblaze', includeApiblazeAccessTokenHeader: false, includeApiblazeIdTokenHeader: false }),
                                      tokenType: value as 'apiblaze' | 'thirdParty'
                                    }
                                  }))}
                                >
                                  <SelectTrigger className="mt-1">
                                    <SelectValue>
                                      {newProvider[client.id]?.tokenType === 'apiblaze' 
                                        ? 'API Blaze JWT token' 
                                        : `${PROVIDER_TYPE_LABELS[newProvider[client.id]?.type || 'google']} token`}
                                    </SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="apiblaze">API Blaze JWT token</SelectItem>
                                    <SelectItem value="thirdParty">
                                      {(newProvider[client.id]?.type || 'google').charAt(0).toUpperCase() + (newProvider[client.id]?.type || 'google').slice(1)} token
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              {(newProvider[client.id]?.tokenType || 'apiblaze') !== 'thirdParty' && (
                              <div>
                                <Label htmlFor={`providerTargetServerToken-${client.id}`} className="text-xs">Target server token type</Label>
                                <p className="text-xs text-muted-foreground">What to send in the Authorization header when forwarding to your target servers</p>
                                <Select
                                  value={newProvider[client.id]?.targetServerToken || 'apiblaze'}
                                  onValueChange={(value) => setNewProvider(prev => ({
                                    ...prev,
                                    [client.id]: {
                                      ...(prev[client.id] || { type: 'google', clientId: '', clientSecret: '', domain: PROVIDER_DOMAINS.google, tokenType: 'apiblaze', targetServerToken: 'apiblaze', includeApiblazeAccessTokenHeader: false, includeApiblazeIdTokenHeader: false }),
                                      targetServerToken: value as 'apiblaze' | 'third_party_access_token' | 'third_party_id_token' | 'none'
                                    }
                                  }))}
                                >
                                  <SelectTrigger className="mt-1">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="apiblaze">API Blaze JWT token</SelectItem>
                                    <SelectItem value="third_party_access_token">{PROVIDER_TYPE_LABELS[newProvider[client.id]?.type || 'google']} access token</SelectItem>
                                    <SelectItem value="third_party_id_token">{PROVIDER_TYPE_LABELS[newProvider[client.id]?.type || 'google']} ID token</SelectItem>
                                    <SelectItem value="none">None</SelectItem>
                                  </SelectContent>
                                </Select>
                                {(newProvider[client.id]?.targetServerToken === 'third_party_access_token' || newProvider[client.id]?.targetServerToken === 'third_party_id_token') && (
                                  <div className="space-y-2 mt-2">
                                    <div className="flex items-center gap-2">
                                      <Switch
                                        id={`providerIncludeApiblazeAccess-${client.id}`}
                                        checked={newProvider[client.id]?.includeApiblazeAccessTokenHeader ?? false}
                                        onCheckedChange={(checked) => setNewProvider(prev => ({
                                          ...prev,
                                          [client.id]: {
                                            ...(prev[client.id] || { type: 'google', clientId: '', clientSecret: '', domain: PROVIDER_DOMAINS.google, tokenType: 'apiblaze', targetServerToken: 'apiblaze', includeApiblazeAccessTokenHeader: false, includeApiblazeIdTokenHeader: false }),
                                            includeApiblazeAccessTokenHeader: checked
                                          }
                                        }))}
                                      />
                                      <Label htmlFor={`providerIncludeApiblazeAccess-${client.id}`} className="text-xs">
                                        Include APIBlaze access token in x-apiblaze-access-token header
                                      </Label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Switch
                                        id={`providerIncludeApiblazeId-${client.id}`}
                                        checked={newProvider[client.id]?.includeApiblazeIdTokenHeader ?? false}
                                        onCheckedChange={(checked) => setNewProvider(prev => ({
                                          ...prev,
                                          [client.id]: {
                                            ...(prev[client.id] || { type: 'google', clientId: '', clientSecret: '', domain: PROVIDER_DOMAINS.google, tokenType: 'apiblaze', targetServerToken: 'apiblaze', includeApiblazeAccessTokenHeader: false, includeApiblazeIdTokenHeader: false }),
                                            includeApiblazeIdTokenHeader: checked
                                          }
                                        }))}
                                      />
                                      <Label htmlFor={`providerIncludeApiblazeId-${client.id}`} className="text-xs">
                                        Include APIBlaze ID token in x-apiblaze-id-token header
                                      </Label>
                                    </div>
                                  </div>
                                )}
                              </div>
                              )}
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => handleAddProvider(client.id)}
                                  disabled={!newProvider[client.id]?.clientId || !newProvider[client.id]?.clientSecret}
                                >
                                  Add Provider
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setShowAddProvider(prev => ({ ...prev, [client.id]: false }));
                                    setNewProvider(prev => {
                                      const next = { ...prev };
                                      delete next[client.id];
                                      return next;
                                    });
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </CardContent>
                          </Card>

                          {/* Right Column - Important Messages & Setup Guide */}
                          <div className="space-y-4">
                            {/* Important Callback URL */}
                            <Card className="border-orange-200 bg-orange-50/50">
                              <CardHeader className="pb-3">
                                <div className="flex items-start gap-2">
                                  <AlertCircle className="h-4 w-4 text-orange-600 mt-0.5" />
                                  <div>
                                    <CardTitle className="text-sm">Important</CardTitle>
                                    <CardDescription className="text-xs mt-1">
                                      Don&apos;t forget to add this authorized callback URL to your OAuth provider:
                                    </CardDescription>
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent>
                                <code className="text-xs bg-white px-2 py-1 rounded border block">
                                  https://callback.apiblaze.com
                                </code>
                              </CardContent>
                            </Card>

                            {/* Setup Guide */}
                            <Card>
                              <CardHeader>
                                <CardTitle className="text-sm">
                                  {(newProvider[client.id]?.type || 'google').charAt(0).toUpperCase() + (newProvider[client.id]?.type || 'google').slice(1)} Setup Guide
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <ol className="text-xs space-y-2 list-decimal list-inside text-muted-foreground">
                                  {PROVIDER_SETUP_GUIDES[newProvider[client.id]?.type || 'google'].map((step, index) => (
                                    <li key={index}>{step}</li>
                                  ))}
                                </ol>
                              </CardContent>
                            </Card>
                          </div>
                        </div>
                      )}

                      {providersError ? (
                        <div className="text-xs text-amber-700 dark:text-amber-400 py-2 flex items-center gap-2">
                          <span>Failed to load providers: {providersError}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => {
                              if (currentAuthConfigId) {
                                clearProvidersForRetry(currentAuthConfigId, client.id);
                                fetchProvidersForClient(currentAuthConfigId, client.id);
                              }
                            }}
                          >
                            Retry
                          </Button>
                        </div>
                      ) : isLoadingProviders && clientProviders.length === 0 ? (
                        <div className="text-xs text-muted-foreground py-2">Loading providers...</div>
                      ) : clientProviders.length === 0 ? (
                        <div className="text-xs text-muted-foreground italic py-2">No providers configured. The default APIBlaze Github login will be used.</div>
                      ) : (
                        <div className="space-y-2">
                          {clientProviders.map((provider) => {
                            const providerEditKey = `${client.id}:${provider.id}`;
                            const isEditingProvider = editingProviderKey === providerEditKey && editProviderForm;
                            return isEditingProvider ? (
                              <Card key={provider.id} className="border-green-200 bg-green-50/50">
                                <CardHeader className="pb-3">
                                  <CardTitle className="text-sm">Edit OAuth Provider</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                  {loadingProviderSecret ? (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      Loading provider secret...
                                    </div>
                                  ) : (
                                    <>
                                      <div>
                                        <Label className="text-xs">Provider Type</Label>
                                        <Select
                                          value={editProviderForm.type}
                                          onValueChange={(value) => setEditProviderForm(prev => prev ? { ...prev, type: value as SocialProvider } : null)}
                                        >
                                          <SelectTrigger className="mt-1">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="google">Google</SelectItem>
                                            <SelectItem value="microsoft">Microsoft</SelectItem>
                                            <SelectItem value="github">GitHub</SelectItem>
                                            <SelectItem value="facebook">Facebook</SelectItem>
                                            <SelectItem value="auth0">Auth0</SelectItem>
                                            <SelectItem value="other">Other</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div>
                                        <Label className="text-xs">Domain</Label>
                                        <Input
                                          value={editProviderForm.domain}
                                          onChange={(e) => setEditProviderForm(prev => prev ? { ...prev, domain: e.target.value } : null)}
                                          placeholder="https://accounts.google.com"
                                          className="mt-1"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs">Client ID</Label>
                                        <Input
                                          value={editProviderForm.clientId}
                                          onChange={(e) => setEditProviderForm(prev => prev ? { ...prev, clientId: e.target.value } : null)}
                                          placeholder="your-client-id"
                                          className="mt-1"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs">Client Secret</Label>
                                        <Input
                                          type="password"
                                          value={editProviderForm.clientSecret}
                                          onChange={(e) => setEditProviderForm(prev => prev ? { ...prev, clientSecret: e.target.value } : null)}
                                          placeholder="your-client-secret"
                                          className="mt-1"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs">Client side token type</Label>
                                        <Select
                                          value={editProviderForm.tokenType}
                                          onValueChange={(value) => setEditProviderForm(prev => prev ? { ...prev, tokenType: value as 'apiblaze' | 'thirdParty' } : null)}
                                        >
                                          <SelectTrigger className="mt-1">
                                            <SelectValue>
                                              {editProviderForm.tokenType === 'apiblaze' ? 'API Blaze JWT token' : `${PROVIDER_TYPE_LABELS[editProviderForm.type]} token`}
                                            </SelectValue>
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="apiblaze">API Blaze JWT token</SelectItem>
                                            <SelectItem value="thirdParty">{PROVIDER_TYPE_LABELS[editProviderForm.type]} token</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      {editProviderForm.tokenType !== 'thirdParty' && (
                                        <div>
                                          <Label className="text-xs">Target server token type</Label>
                                          <Select
                                            value={editProviderForm.targetServerToken}
                                            onValueChange={(value) => setEditProviderForm(prev => prev ? { ...prev, targetServerToken: value as typeof prev.targetServerToken } : null)}
                                          >
                                            <SelectTrigger className="mt-1">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="apiblaze">API Blaze JWT token</SelectItem>
                                              <SelectItem value="third_party_access_token">{PROVIDER_TYPE_LABELS[editProviderForm.type]} access token</SelectItem>
                                              <SelectItem value="third_party_id_token">{PROVIDER_TYPE_LABELS[editProviderForm.type]} ID token</SelectItem>
                                              <SelectItem value="none">None</SelectItem>
                                            </SelectContent>
                                          </Select>
                                          {(editProviderForm.targetServerToken === 'third_party_access_token' || editProviderForm.targetServerToken === 'third_party_id_token') && (
                                            <div className="space-y-2 mt-2">
                                              <div className="flex items-center gap-2">
                                                <Switch
                                                  checked={editProviderForm.includeApiblazeAccessTokenHeader}
                                                  onCheckedChange={(checked) => setEditProviderForm(prev => prev ? { ...prev, includeApiblazeAccessTokenHeader: checked } : null)}
                                                />
                                                <Label className="text-xs">Include APIBlaze access token in x-apiblaze-access-token header</Label>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <Switch
                                                  checked={editProviderForm.includeApiblazeIdTokenHeader}
                                                  onCheckedChange={(checked) => setEditProviderForm(prev => prev ? { ...prev, includeApiblazeIdTokenHeader: checked } : null)}
                                                />
                                                <Label className="text-xs">Include APIBlaze ID token in x-apiblaze-id-token header</Label>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      <div className="flex gap-2">
                                        <Button
                                          type="button"
                                          size="sm"
                                          onClick={saveProviderEdit}
                                          disabled={savingProviderEdit || !editProviderForm.clientId.trim() || !editProviderForm.clientSecret.trim()}
                                        >
                                          {savingProviderEdit ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                          Save
                                        </Button>
                                        <Button type="button" variant="ghost" size="sm" onClick={cancelProviderEdit}>
                                          Cancel
                                        </Button>
                                      </div>
                                    </>
                                  )}
                                </CardContent>
                              </Card>
                            ) : (
                              <div
                                key={provider.id}
                                className="flex items-center justify-between p-2.5 bg-gray-50/50 border border-gray-200 rounded-md hover:bg-gray-100/50 transition-colors"
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs font-medium capitalize">
                                      {provider.type}
                                    </Badge>
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-1.5 space-y-0.5">
                                    <div className="truncate">
                                      <span className="font-medium">Domain:</span> {provider.domain}
                                    </div>
                                    <div className="truncate">
                                      <span className="font-medium">Client ID:</span> {provider.client_id || provider.clientId}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => startEditProvider(client.id, provider)}
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-600 hover:bg-blue-50"
                                    title="Edit provider"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteProvider(client.id, provider.id)}
                                    className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

export function AuthenticationSection({ config, updateConfig, isEditMode = false, project, onProjectUpdate, teamId }: AuthenticationSectionProps) {
  const getAuthConfigs = useDashboardCacheStore((s) => s.getAuthConfigs);
  const getAuthConfig = useDashboardCacheStore((s) => s.getAuthConfig);
  const getAppClients = useDashboardCacheStore((s) => s.getAppClients);
  const getProviders = useDashboardCacheStore((s) => s.getProviders);
  const isBootstrapping = useDashboardCacheStore((s) => s.isBootstrapping);
  const existingAuthConfigs = getAuthConfigs();
  const loadingAuthConfigs = isBootstrapping;

  const [newScope, setNewScope] = useState('');
  // Save config changes immediately to backend (for edit mode, e.g. default_app_client_id)
  const saveProjectConfigImmediately = async (updates: { default_app_client_id?: string | null }) => {
    if (!project) return;
    try {
      const configToSave: Record<string, unknown> = {};
      if (updates.default_app_client_id !== undefined) {
        configToSave.default_app_client_id = updates.default_app_client_id;
      }
      if (Object.keys(configToSave).length > 0) {
        await updateProjectConfig(project.project_id, project.api_version, configToSave);
        const updatedConfig = project.config
          ? { ...(project.config as Record<string, unknown>), ...configToSave }
          : configToSave;
        if (onProjectUpdate) {
          onProjectUpdate({ ...project, config: updatedConfig });
        }
      }
    } catch (error) {
      console.error('Error saving project config:', error);
    }
  };
  // Helper to get default callback URL based on current project name
  const getDefaultCallbackUrl = () => {
    const projectName = config.projectName || 'project';
    const apiVersion = config.apiVersion || '1.0.0';
    return `https://${projectName}.portal.apiblaze.com/${apiVersion}`;
  };
  
  // Initialize with default URL if none exist
  const [authorizedCallbackUrls, setAuthorizedCallbackUrls] = useState<string[]>(() => {
    if (config.authorizedCallbackUrls && config.authorizedCallbackUrls.length > 0) {
      return config.authorizedCallbackUrls;
    }
    const defaultUrl = getDefaultCallbackUrl();
    return [defaultUrl];
  });
  const [newAuthorizedCallbackUrl, setNewAuthorizedCallbackUrl] = useState('');
  const [authConfigModalOpen, setAuthConfigModalOpen] = useState(false);
  
  // Update default URL when project name changes
  useEffect(() => {
    const defaultUrl = getDefaultCallbackUrl();
    const currentUrls = authorizedCallbackUrls;
    
    // Check if first URL is a portal.apiblaze.com URL (old default pattern without version, or new pattern with version)
    const firstUrlIsDefault = currentUrls.length > 0 && 
      (currentUrls[0].match(/^https:\/\/[^/]+\.portal\.apiblaze\.com$/) || 
       currentUrls[0].match(/^https:\/\/[^/]+\.portal\.apiblaze\.com\/[^/]+$/));
    
    if (firstUrlIsDefault) {
      // Replace the first URL with the new default
      const otherUrls = currentUrls.slice(1).filter(u => u !== defaultUrl);
      const updatedUrls = [defaultUrl, ...otherUrls];
      if (JSON.stringify(updatedUrls) !== JSON.stringify(currentUrls)) {
        setAuthorizedCallbackUrls(updatedUrls);
        updateConfig({ authorizedCallbackUrls: updatedUrls });
      }
    } else if (currentUrls.length === 0 || !currentUrls.some(u => u.match(/^https:\/\/[^/]+\.portal\.apiblaze\.com(\/.*)?$/))) {
      // No default URL present, add it as first
      const otherUrls = currentUrls.filter(u => !u.match(/^https:\/\/[^/]+\.portal\.apiblaze\.com(\/.*)?$/));
      const updatedUrls = [defaultUrl, ...otherUrls];
      setAuthorizedCallbackUrls(updatedUrls);
      updateConfig({ authorizedCallbackUrls: updatedUrls });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.projectName, config.apiVersion]);
  
  // Helper function to update both state and config
  const updateAuthorizedCallbackUrls = (urls: string[]) => {
    setAuthorizedCallbackUrls(urls);
    updateConfig({ authorizedCallbackUrls: urls });
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [selectedAppClient, setSelectedAppClient] = useState<AppClient & { authConfigId: string } | null>(null);
  // State for edit mode functions (used internally by loadAppClientDetails and loadThirdPartyProvider)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [appClientDetails, setAppClientDetails] = useState<AppClientResponse | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loadingAppClient, setLoadingAppClient] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [copiedField, setCopiedField] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [thirdPartyProvider, setThirdPartyProvider] = useState<SocialProviderResponse | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loadingProvider, setLoadingProvider] = useState(false);
  const [authConfigSelectModalOpen, setAuthConfigSelectModalOpen] = useState(false);
  const [newAllowedIssuer, setNewAllowedIssuer] = useState('');
  const [newAllowedAudience, setNewAllowedAudience] = useState('');

  const addAllowedIssuer = () => {
    const v = newAllowedIssuer.trim();
    if (!v) return;
    const current = config.allowedIssuers ?? [];
    if (current.includes(v)) return;
    setNewAllowedIssuer('');
    updateConfig({ allowedIssuers: [...current, v] });
  };
  const removeAllowedIssuer = (iss: string) => {
    updateConfig({ allowedIssuers: (config.allowedIssuers ?? []).filter((i) => i !== iss) });
  };
  const addAllowedAudience = () => {
    const v = newAllowedAudience.trim();
    if (!v) return;
    const current = config.allowedAudiences ?? [];
    if (current.includes(v)) return;
    setNewAllowedAudience('');
    updateConfig({ allowedAudiences: [...current, v] });
  };
  const removeAllowedAudience = (aud: string) => {
    updateConfig({ allowedAudiences: (config.allowedAudiences ?? []).filter((a) => a !== aud) });
  };

  // Track if we've already loaded auth configs to prevent repeated API calls
  // Track initial bringOwnProvider to avoid updating on mount
  const previousBringOwnProviderRef = useRef<boolean | undefined>(config.bringOwnProvider);

  // Update authConfig's bringMyOwnOAuth when bringOwnProvider changes
  useEffect(() => {
    // Only update if we have a authConfigId and we're in edit mode
    if (!isEditMode || !config.authConfigId || !project) {
      previousBringOwnProviderRef.current = config.bringOwnProvider;
      return;
    }

    // Skip if this is the initial load (value hasn't changed)
    if (previousBringOwnProviderRef.current === config.bringOwnProvider) {
      return;
    }

    // Update the authConfig with the new bringOwnProvider value
    const updateAuthConfigBringOwnOAuth = async () => {
      try {
        // Backend requires 'name' field, so we need to include it
        // Try to get name from existingAuthConfigs list, or fetch it, or use userGroupName as fallback
        let name = config.userGroupName;
        const authConfig = existingAuthConfigs.find((ac: AuthConfig) => ac.id === config.authConfigId);
        if (authConfig) {
          name = authConfig.name;
        } else if (!name) {
          // Fetch the auth config to get its name
          const fullAuthConfig = await api.getAuthConfig(config.authConfigId!);
          name = fullAuthConfig.name;
        }
        await api.updateAuthConfig(config.authConfigId!, {
          name: name || 'Unnamed Auth Config',
          bringMyOwnOAuth: config.bringOwnProvider,
        });
        console.log('[AuthSection] ✅ Updated authConfig bringMyOwnOAuth:', config.bringOwnProvider);
        previousBringOwnProviderRef.current = config.bringOwnProvider;
      } catch (error) {
        console.error('[AuthSection] ❌ Error updating authConfig bringMyOwnOAuth:', error);
      }
    };

    updateAuthConfigBringOwnOAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.bringOwnProvider, config.authConfigId, isEditMode, project]);

  // Update authConfig's enableApiKeyAuth when requestsAuthMethods changes (edit mode) - derive from "Authenticate by API key" switch
  const previousApiKeyInMethodsRef = useRef<boolean | undefined>(config.requestsAuthMethods?.includes('api_key'));
  useEffect(() => {
    if (!isEditMode || !config.authConfigId || !project) {
      previousApiKeyInMethodsRef.current = config.requestsAuthMethods?.includes('api_key');
      return;
    }
    const apiKeyEnabled = config.requestsAuthMethods?.includes('api_key') ?? false;
    if (previousApiKeyInMethodsRef.current === apiKeyEnabled) return;

    const updateAuthConfigApiKey = async () => {
      try {
        let name = config.userGroupName;
        const authConfig = existingAuthConfigs.find((ac: AuthConfig) => ac.id === config.authConfigId);
        if (authConfig) {
          name = authConfig.name;
        } else if (!name) {
          const fullAuthConfig = await api.getAuthConfig(config.authConfigId!);
          name = fullAuthConfig.name;
        }
        await api.updateAuthConfig(config.authConfigId!, {
          name: name || 'Unnamed Auth Config',
          enableApiKeyAuth: apiKeyEnabled,
        });
        previousApiKeyInMethodsRef.current = apiKeyEnabled;
      } catch (error) {
        console.error('[AuthSection] Error updating authConfig enableApiKeyAuth:', error);
      }
    };

    updateAuthConfigApiKey();
  }, [config.requestsAuthMethods, config.authConfigId, config.userGroupName, isEditMode, project, existingAuthConfigs]);

  // Track selected authConfigId - only set if we're in edit mode with an existing config
  const [selectedAuthConfigId, setSelectedAuthConfigId] = useState<string | undefined>(
    isEditMode && project?.config ? (project.config as Record<string, unknown>).auth_config_id as string | undefined : undefined
  );
  
  // Only sync from config.authConfigId in edit mode on initial mount
  const hasSyncedFromConfigRef = useRef(false);
  useEffect(() => {
    if (hasSyncedFromConfigRef.current) return;
    if (isEditMode && config.authConfigId && config.authConfigId !== selectedAuthConfigId) {
      setSelectedAuthConfigId(config.authConfigId);
      hasSyncedFromConfigRef.current = true;
    }
  }, [isEditMode, config.authConfigId, selectedAuthConfigId]);

  // In create mode, sync selectedAuthConfigId from config.authConfigId so prefill or future flows trigger the load effect
  useEffect(() => {
    if (isEditMode || !config.authConfigId || config.authConfigId === selectedAuthConfigId) return;
    setSelectedAuthConfigId(config.authConfigId);
  }, [isEditMode, config.authConfigId, selectedAuthConfigId]);

  // On a new project, prepopulate Auth Config Name with {projectName}-authConfig when project name is set (only while field is empty)
  useEffect(() => {
    if (isEditMode || project) return;
    if (!config.projectName || config.userGroupName !== '') return;
    updateConfig({ userGroupName: `${config.projectName}-authConfig` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.projectName, isEditMode, project]);

  // Get the determined authConfigId (same logic as in EditModeManagementUI)
  const determinedAuthConfigId = useMemo(() => {
    if (!isEditMode || !project) {
      return undefined;
    }
    const projectConfig = project.config as Record<string, unknown> | undefined;
    const projectAuthConfigId = projectConfig?.auth_config_id as string | undefined;
    
    if (projectAuthConfigId) return projectAuthConfigId;
    if (config.authConfigId) return config.authConfigId;
    if (existingAuthConfigs.length === 1) return existingAuthConfigs[0].id;
    return undefined;
  }, [isEditMode, project, config.authConfigId, existingAuthConfigs]);

  // In edit mode, populate userGroupName from project's auth config or from determined authConfigId
  useEffect(() => {
    if (!isEditMode || !project || !determinedAuthConfigId) {
      return;
    }
    const nameToSet = existingAuthConfigs.find(pool => pool.id === determinedAuthConfigId)?.name;
    if (nameToSet && (!config.userGroupName || config.userGroupName !== nameToSet)) {
      updateConfig({ userGroupName: nameToSet, authConfigId: determinedAuthConfigId });
      return;
    }
    // Fallback: fetch auth config by id when not in cache (e.g. list not yet loaded)
    if (!config.userGroupName || config.userGroupName === '') {
      let cancelled = false;
      api.getAuthConfig(determinedAuthConfigId)
        .then((ac) => {
          if (!cancelled && ac?.name) {
            updateConfig({ userGroupName: ac.name, authConfigId: determinedAuthConfigId });
          }
        })
        .catch(() => { /* ignore */ });
      return () => { cancelled = true; };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, project, determinedAuthConfigId, config.userGroupName, existingAuthConfigs]);

  // Track which authConfigId we've already loaded data for to prevent duplicate loads
  const loadedAuthConfigIdRef = useRef<string | undefined>(undefined);

  // When user types in Auth Config Name: if it matches an existing auth config, select and load it; if non-empty and no match, clear selection (new auth config)
  // Skip when name is empty to avoid clearing on initial load before edit-mode effect populates the name
  useEffect(() => {
    const name = (config.userGroupName ?? '').trim();
    if (!name) return;
    const match = existingAuthConfigs.find(pool => pool.name === name);
    if (match) {
      if (config.authConfigId !== match.id || selectedAuthConfigId !== match.id) {
        loadedAuthConfigIdRef.current = undefined;
        setSelectedAuthConfigId(match.id);
        updateConfig({ authConfigId: match.id, userGroupName: match.name, useAuthConfig: true });
      }
    } else {
      if (config.authConfigId != null || selectedAuthConfigId != null) {
        loadedAuthConfigIdRef.current = undefined;
        setSelectedAuthConfigId(undefined);
        updateConfig({ authConfigId: undefined, useAuthConfig: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.userGroupName]);

  // When selectedAuthConfigId changes (user selected from search/dropdown/modal), load that auth config and replace all fields
  // Runs in both create and edit mode so changing auth config always populates from the new one
  useEffect(() => {
    if (!selectedAuthConfigId) {
      return;
    }
    // Skip if we've already loaded data for this authConfigId (avoids re-running on same selection)
    if (loadedAuthConfigIdRef.current === selectedAuthConfigId) {
      return;
    }
    loadedAuthConfigIdRef.current = selectedAuthConfigId;

    const ac = getAuthConfig(selectedAuthConfigId);
    if (ac) {
      updateConfig({
        authConfigId: selectedAuthConfigId,
        useAuthConfig: true,
        userGroupName: ac.name,
        enableSocialAuth: true,
        bringOwnProvider: ac.bringMyOwnOAuth ?? false,
      });
    } else {
      updateConfig({ authConfigId: selectedAuthConfigId, useAuthConfig: true });
    }
    const clients = getAppClients(selectedAuthConfigId);
    if (clients.length > 0) {
      const defaultClient = clients.find(c => c.id === config.defaultAppClient) || clients[0];
      updateConfig({
        appClientId: defaultClient.id,
        defaultAppClient: defaultClient.id,
      });
    } else {
      updateConfig({ appClientId: undefined, defaultAppClient: undefined });
    }
    const first = clients[0];
    if (first) {
      const provList = getProviders(selectedAuthConfigId, first.id);
      if (provList.length > 0) {
        const provider = provList[0] as SocialProviderResponse;
        setThirdPartyProvider(provider);
        updateConfig({
          bringOwnProvider: true,
          socialProvider: (provider.type || 'google') as 'github' | 'google' | 'microsoft' | 'facebook' | 'auth0' | 'other',
          identityProviderDomain: provider.domain || 'https://accounts.google.com',
          identityProviderClientId: (provider as { client_id?: string }).client_id || provider.clientId || '',
          tokenType: ((provider.tokenType ?? (provider as { token_type?: string }).token_type) ?? 'apiblaze') as 'apiblaze' | 'thirdParty',
          targetServerToken: ((provider.targetServerToken ?? (provider as { target_server_token?: string }).target_server_token) ?? 'apiblaze') as 'apiblaze' | 'third_party_access_token' | 'third_party_id_token' | 'none',
          includeApiblazeAccessTokenHeader: provider.includeApiblazeAccessTokenHeader ?? (provider as { include_apiblaze_access_token_header?: boolean }).include_apiblaze_access_token_header ?? (provider as { include_apiblaze_token_header?: boolean }).include_apiblaze_token_header ?? false,
          includeApiblazeIdTokenHeader: provider.includeApiblazeIdTokenHeader ?? (provider as { include_apiblaze_id_token_header?: boolean }).include_apiblaze_id_token_header ?? false,
        });
      } else {
        setThirdPartyProvider(null);
        updateConfig({
          bringOwnProvider: false,
          identityProviderDomain: 'https://accounts.google.com',
          identityProviderClientId: '',
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAuthConfigId]);

  const handleProviderChange = (provider: SocialProvider) => {
    updateConfig({
      socialProvider: provider,
      identityProviderDomain: PROVIDER_DOMAINS[provider],
    });
  };

  const addScope = () => {
    if (newScope && !config.authorizedScopes.includes(newScope)) {
      updateConfig({
        authorizedScopes: [...config.authorizedScopes, newScope],
      });
      setNewScope('');
    }
  };

  const removeScope = (scope: string) => {
    if (['email', 'openid', 'profile'].includes(scope)) return; // Don't remove mandatory scopes
    updateConfig({
      authorizedScopes: config.authorizedScopes.filter(s => s !== scope),
    });
  };

  const handleUseExistingAuthConfig = (appClient: AppClient & { authConfigId: string }) => {
    setSelectedAppClient(appClient);
    loadedAuthConfigIdRef.current = undefined;
    setSelectedAuthConfigId(appClient.authConfigId);
    updateConfig({
      useAuthConfig: true,
      authConfigId: appClient.authConfigId,
      appClientId: appClient.id,
    });
    setAuthConfigModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Auth Config Name - only in edit mode (existing project) */}
      {isEditMode && (
        <>
          <div>
            <Label htmlFor="userGroupName" className="text-base font-semibold">
              Auth Config Name
            </Label>
            <p className="text-sm text-muted-foreground mb-3">
              Give a name to your Auth Config if its new or Search for an existing Auth Config to reuse
            </p>
            <div className="relative">
              <Input
                id="userGroupName"
                placeholder={
                  loadingAuthConfigs
                    ? "Loading..."
                    : config.projectName
                      ? `Enter a unique name (e.g., ${config.projectName}-authConfig)`
                      : "Enter a unique name (e.g., my-project-authConfig)"
                }
                value={config.userGroupName}
                onChange={(e) => updateConfig({ userGroupName: e.target.value })}
                className="pr-10"
                disabled={loadingAuthConfigs}
              />
              {loadingAuthConfigs ? (
                <div className="absolute right-10 top-1/2 -translate-y-1/2">
                  <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                </div>
              ) : null}
              <DropdownMenu
                onOpenChange={() => {
                  // Don't load here - use preloaded data or existing data
                  // create-project-dialog already handles preloading
                }}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    title="Select existing auth config"
                  >
                    <Search className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[200px] max-w-[400px]">
                  {loadingAuthConfigs && existingAuthConfigs.length === 0 ? (
                    <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
                  ) : existingAuthConfigs.length === 0 ? (
                    <DropdownMenuItem disabled>No auth configs found</DropdownMenuItem>
                  ) : (
                    existingAuthConfigs.map((pool) => (
                      <DropdownMenuItem
                        key={pool.id}
                        onClick={() => {
                          updateConfig({ userGroupName: pool.name, authConfigId: pool.id, useAuthConfig: true });
                          setSelectedAuthConfigId(pool.id);
                        }}
                      >
                        {pool.name}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <Separator />
        </>
      )}

      {/* Authentication Methods */}
      <div className="space-y-4">
        <div>
          <Label className="text-base font-semibold">Authentication Methods</Label>
          <p className="text-sm text-muted-foreground">
            Protect your APIs with API keys or oAuth tokens
          </p>
        </div>

        {/* Requests Authentication */}
        <div className="flex flex-col gap-4 p-4 border rounded-lg">
          <div>
            <Label className="text-sm font-medium">Requests Authentication</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              How each API request is authenticated before being passed through
            </p>
          </div>
          <Select
            value={config.requestsAuthMode ?? 'authenticate'}
            onValueChange={(v) => {
              const updates: Partial<ProjectConfig> = { requestsAuthMode: v as 'authenticate' | 'passthrough' };
              if (v === 'authenticate' && !isEditMode) {
                updates.requestsAuthMethods = ['jwt', 'api_key'];
              }
              updateConfig(updates);
            }}
          >
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="authenticate">Authenticate every request</SelectItem>
              <SelectItem value="passthrough">No Authentication. Passthrough traffic</SelectItem>
            </SelectContent>
          </Select>

          {/* Authentication method subsection - when authenticate is selected */}
          {config.requestsAuthMode === 'authenticate' && (
            <div className="space-y-4 pl-4 border-l-2 border-muted">
              <p className="text-xs text-muted-foreground">The way each request is authenticated</p>

              {/* JWT tokens checkbox */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="requestsAuthJwt"
                      checked={config.requestsAuthMethods?.includes('jwt') ?? true}
                      onCheckedChange={(checked) => {
                        const methods = config.requestsAuthMethods ?? ['jwt'];
                        const next: ('jwt' | 'opaque' | 'api_key')[] = checked
                          ? (methods.includes('jwt') ? methods : [...methods, 'jwt'])
                          : methods.filter((m) => m !== 'jwt') as ('jwt' | 'opaque' | 'api_key')[];
                        updateConfig({ requestsAuthMethods: next.length ? next : ['jwt'] });
                      }}
                    />
                    <Label htmlFor="requestsAuthJwt" className="text-sm font-medium">Authenticate JWT tokens</Label>
                  </div>
                  {config.requestsAuthMethods?.includes('jwt') && isEditMode && (
                    <div className="space-y-2 ml-6 mt-2">
                      <div>
                        <Label className="text-xs">Allowed issuers (iss)</Label>
                        <div className="flex gap-2 mt-1">
                          <Input
                            value={newAllowedIssuer}
                            onChange={(e) => setNewAllowedIssuer(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addAllowedIssuer();
                              }
                            }}
                            className="text-sm"
                          />
                          <Button type="button" size="sm" onClick={addAllowedIssuer}><Plus className="h-3 w-3" /></Button>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(config.allowedIssuers ?? []).map((iss) => (
                            <span key={iss} className="inline-flex items-center gap-0.5 bg-muted px-2 py-0.5 rounded text-xs">
                              {iss}
                              <button type="button" onClick={() => removeAllowedIssuer(iss)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Allowed audience (aud)</Label>
                        <div className="flex gap-2 mt-1">
                          <Input
                            value={newAllowedAudience}
                            onChange={(e) => setNewAllowedAudience(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addAllowedAudience();
                              }
                            }}
                            className="text-sm"
                          />
                          <Button type="button" size="sm" onClick={addAllowedAudience}><Plus className="h-3 w-3" /></Button>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(config.allowedAudiences ?? []).map((aud) => (
                            <span key={aud} className="inline-flex items-center gap-0.5 bg-muted px-2 py-0.5 rounded text-xs">
                              {aud}
                              <button type="button" onClick={() => removeAllowedAudience(aud)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Opaque tokens checkbox */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="requestsAuthOpaque"
                      checked={config.requestsAuthMethods?.includes('opaque') ?? false}
                      onCheckedChange={(checked) => {
                        const methods = config.requestsAuthMethods ?? ['jwt'];
                        const next: ('jwt' | 'opaque' | 'api_key')[] = checked
                          ? [...methods, 'opaque']
                          : methods.filter((m) => m !== 'opaque') as ('jwt' | 'opaque' | 'api_key')[];
                        updateConfig({ requestsAuthMethods: next });
                      }}
                    />
                    <Label htmlFor="requestsAuthOpaque" className="text-sm font-medium">
                      {(config.requestsAuthMethods?.includes('jwt') && config.requestsAuthMethods?.includes('opaque')) ? 'and ' : ''}Authenticate opaque tokens
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground ml-6">
                    We will send a request to verify the token (do NOT use Google, Facebook, … introspection endpoint), build your own
                  </p>
                  {config.requestsAuthMethods?.includes('opaque') && (
                    <div className="space-y-2 ml-6 mt-2">
                      <div>
                        <Label className="text-xs">Token verification endpoint</Label>
                        <Input
                          placeholder="https://your-endpoint.com/introspect"
                          value={config.opaqueTokenEndpoint ?? ''}
                          onChange={(e) => updateConfig({ opaqueTokenEndpoint: e.target.value })}
                          className="mt-1 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Method</Label>
                        <Select
                          value={config.opaqueTokenMethod ?? 'GET'}
                          onValueChange={(v) => updateConfig({ opaqueTokenMethod: v as 'GET' | 'POST' })}
                        >
                          <SelectTrigger className="mt-1 w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="GET">GET</SelectItem>
                            <SelectItem value="POST">POST</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Params (use {'{token}'} for the token)</Label>
                        <Input
                          value={config.opaqueTokenParams ?? '?access_token={token}'}
                          onChange={(e) => updateConfig({ opaqueTokenParams: e.target.value })}
                          className="mt-1 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Body (use {'{token}'} for the token)</Label>
                        <Input
                          value={config.opaqueTokenBody ?? 'token={token}'}
                          onChange={(e) => updateConfig({ opaqueTokenBody: e.target.value })}
                          className="mt-1 text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* API key checkbox */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="requestsAuthApiKey"
                      checked={config.requestsAuthMethods?.includes('api_key') ?? true}
                      onCheckedChange={(checked) => {
                        const methods = config.requestsAuthMethods ?? ['jwt'];
                        const next: ('jwt' | 'opaque' | 'api_key')[] = checked
                          ? (methods.includes('api_key') ? methods : [...methods, 'api_key'])
                          : methods.filter((m) => m !== 'api_key') as ('jwt' | 'opaque' | 'api_key')[];
                        updateConfig({ requestsAuthMethods: next.length ? next : ['jwt'] });
                      }}
                    />
                    <Label htmlFor="requestsAuthApiKey" className="text-sm font-medium">
                      {(config.requestsAuthMethods?.includes('jwt') && config.requestsAuthMethods?.includes('api_key')) ? 'or ' : ''}Authenticate by API key
                    </Label>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* OAuth config - Bring My Own OAuth Provider, etc. - always shown for dev portal */}
        <div className="space-y-4 pl-4 border-l-2 border-blue-200">
            {/* Bring My Own OAuth Provider - first inside expanded section */}
            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
              <div className="space-y-1">
                <Label htmlFor="bringOwnProvider" className="text-sm font-medium">
                  Host my own login page for this API (oAuth)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Use your own Google, Auth0, or other OAuth provider
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  or leave it off to use default APIBlaze GitHub to login on your API portal and obtain JWT tokens
                </p>
              </div>
              <Switch
                id="bringOwnProvider"
                checked={config.bringOwnProvider}
                onCheckedChange={(checked) => updateConfig({ bringOwnProvider: checked })}
              />
            </div>
            {isEditMode ? (
              <div className="space-y-4">
                <EditModeManagementUI
                  config={config}
                  updateConfig={updateConfig}
                  project={project}
                  onProjectUpdate={onProjectUpdate}
                  initialAuthConfigId={config.authConfigId ?? (project?.config ? (project.config as Record<string, unknown>).auth_config_id as string | undefined : undefined)}
                  teamId={teamId}
                />
              </div>
            ) : (
              <div className="space-y-4">
                {config.useAuthConfig && config.authConfigId ? (
                  <EditModeManagementUI
                    config={config}
                    updateConfig={updateConfig}
                    project={project}
                    onProjectUpdate={onProjectUpdate}
                    teamId={teamId}
                  />
                ) : (
                  <>
                    {/* Provider Configuration - Two Column Layout */}
                    {config.bringOwnProvider && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="socialProvider" className="text-sm">OAuth Provider</Label>
                            <Select
                              value={config.socialProvider}
                              onValueChange={(value) => handleProviderChange(value as SocialProvider)}
                            >
                              <SelectTrigger className="mt-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="google">Google</SelectItem>
                                <SelectItem value="microsoft">Microsoft</SelectItem>
                                <SelectItem value="github">GitHub</SelectItem>
                                <SelectItem value="facebook">Facebook</SelectItem>
                                <SelectItem value="auth0">Auth0</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label htmlFor="identityProviderDomain" className="text-sm">Identity Provider Domain</Label>
                            <Input
                              id="identityProviderDomain"
                              placeholder="https://accounts.google.com"
                              value={config.identityProviderDomain}
                              onChange={(e) => updateConfig({ identityProviderDomain: e.target.value })}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label htmlFor="identityProviderClientId" className="text-sm">Client ID</Label>
                            <Input
                              id="identityProviderClientId"
                              placeholder="your-client-id"
                              value={config.identityProviderClientId}
                              onChange={(e) => updateConfig({ identityProviderClientId: e.target.value })}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label htmlFor="identityProviderClientSecret" className="text-sm">Client Secret</Label>
                            <Input
                              id="identityProviderClientSecret"
                              type="password"
                              placeholder="your-client-secret"
                              value={config.identityProviderClientSecret}
                              onChange={(e) => updateConfig({ identityProviderClientSecret: e.target.value })}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label htmlFor="tokenType" className="text-sm">Client side token type</Label>
                            <p className="text-xs text-muted-foreground">
                              {(config.tokenType || 'apiblaze') === 'thirdParty'
                                ? 'Tokens the API users will see and that will be forwarded to your target servers'
                                : 'Tokens the API users will see'}
                            </p>
                            <Select
                              value={config.tokenType || 'apiblaze'}
                              onValueChange={(value) => {
                                const updates: Partial<ProjectConfig> = { tokenType: value as 'apiblaze' | 'thirdParty' };
                                if (value === 'thirdParty') {
                                  updates.requestsAuthMode = 'passthrough';
                                } else if (value === 'apiblaze') {
                                  updates.requestsAuthMode = 'authenticate';
                                }
                                updateConfig(updates);
                              }}
                            >
                              <SelectTrigger className="mt-1">
                                <SelectValue>
                                  {config.tokenType === 'apiblaze' 
                                    ? 'API Blaze JWT token' 
                                    : `${PROVIDER_TYPE_LABELS[config.socialProvider]} token`}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="apiblaze">API Blaze JWT token</SelectItem>
                                <SelectItem value="thirdParty">
                                  {config.socialProvider.charAt(0).toUpperCase() + config.socialProvider.slice(1)} token
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {(config.tokenType || 'apiblaze') !== 'thirdParty' && (
                          <div>
                            <Label htmlFor="targetServerToken" className="text-sm">Target server token type</Label>
                            <p className="text-xs text-muted-foreground">What to send in the Authorization header when forwarding to your target servers</p>
                            <Select
                              value={config.targetServerToken || 'apiblaze'}
                              onValueChange={(value) => updateConfig({ targetServerToken: value as 'apiblaze' | 'third_party_access_token' | 'third_party_id_token' | 'none' })}
                            >
                              <SelectTrigger className="mt-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="apiblaze">API Blaze JWT token</SelectItem>
                                <SelectItem value="third_party_access_token">{PROVIDER_TYPE_LABELS[config.socialProvider]} access token</SelectItem>
                                <SelectItem value="third_party_id_token">{PROVIDER_TYPE_LABELS[config.socialProvider]} ID token</SelectItem>
                                <SelectItem value="none">None</SelectItem>
                              </SelectContent>
                            </Select>
                            {(config.targetServerToken === 'third_party_access_token' || config.targetServerToken === 'third_party_id_token') && (
                              <div className="space-y-2 mt-2">
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={config.includeApiblazeAccessTokenHeader ?? false}
                                    onCheckedChange={(checked) => updateConfig({ includeApiblazeAccessTokenHeader: checked })}
                                  />
                                  <Label className="text-xs">
                                    Include APIBlaze access token in x-apiblaze-access-token header
                                  </Label>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={config.includeApiblazeIdTokenHeader ?? false}
                                    onCheckedChange={(checked) => updateConfig({ includeApiblazeIdTokenHeader: checked })}
                                  />
                                  <Label className="text-xs">
                                    Include APIBlaze ID token in x-apiblaze-id-token header
                                  </Label>
                                </div>
                              </div>
                            )}
                          </div>
                          )}
                          <div>
                            <Label className="text-sm">Authorized Scopes</Label>
                            <p className="text-xs text-muted-foreground mb-2">Default mandatory scopes: email, openid, profile</p>
                            <div className="flex flex-wrap gap-2 mb-2">
                              {config.authorizedScopes.map((scope) => (
                                <Badge key={scope} variant="secondary" className="text-xs">
                                  {scope}
                                  {!['email', 'openid', 'profile'].includes(scope) && (
                                    <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => removeScope(scope)} />
                                  )}
                                </Badge>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <Input placeholder="Add custom scope" value={newScope} onChange={(e) => setNewScope(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addScope(); } }} />
                              <Button type="button" size="sm" onClick={addScope}><Plus className="h-4 w-4" /></Button>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <Card className="border-orange-200 bg-orange-50/50">
                            <CardHeader className="pb-3">
                              <div className="flex items-start gap-2">
                                <AlertCircle className="h-4 w-4 text-orange-600 mt-0.5" />
                                <div>
                                  <CardTitle className="text-sm">Important</CardTitle>
                                  <CardDescription className="text-xs mt-1">Don&apos;t forget to add this authorized callback URL to your OAuth provider:</CardDescription>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <code className="text-xs bg-white px-2 py-1 rounded border block">https://callback.apiblaze.com</code>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardHeader>
                              <CardTitle className="text-sm">{config.socialProvider.charAt(0).toUpperCase() + config.socialProvider.slice(1)} Setup Guide</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <ol className="text-xs space-y-2 list-decimal list-inside text-muted-foreground">
                                {PROVIDER_SETUP_GUIDES[config.socialProvider].map((step, index) => (
                                  <li key={index}>{step}</li>
                                ))}
                              </ol>
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label className="text-sm">Authorized Callback URLs</Label>
                      <div className="flex gap-2 mb-2 mt-2">
                        <Input value={newAuthorizedCallbackUrl} onChange={(e) => setNewAuthorizedCallbackUrl(e.target.value)} placeholder="https://example.com/callback" className="text-xs" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const url = newAuthorizedCallbackUrl.trim(); if (url && !authorizedCallbackUrls.includes(url)) { try { const urlObj = new URL(url); if (urlObj.protocol !== 'https:') { alert('URL must use HTTPS protocol'); return; } updateAuthorizedCallbackUrls([...authorizedCallbackUrls, url]); setNewAuthorizedCallbackUrl(''); } catch { alert('Invalid URL format'); } } } }} />
                        <Button type="button" size="sm" onClick={() => { const url = newAuthorizedCallbackUrl.trim(); if (!url) return; if (authorizedCallbackUrls.includes(url)) { alert('This URL is already in the list'); return; } try { const urlObj = new URL(url); if (urlObj.protocol !== 'https:') { alert('URL must use HTTPS protocol'); return; } updateAuthorizedCallbackUrls([...authorizedCallbackUrls, url]); setNewAuthorizedCallbackUrl(''); } catch { alert('Invalid URL format'); } }}><Plus className="h-3 w-3" /></Button>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {authorizedCallbackUrls.map((url, index) => (
                          <div key={url} className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs">
                            {index === 0 && <Badge variant="secondary" className="mr-1 text-xs"><Star className="h-2 w-2 mr-1" />Default</Badge>}
                            <span>{url}</span>
                            <Button type="button" variant="ghost" size="sm" className="h-4 w-4 p-0" onClick={() => updateAuthorizedCallbackUrls(authorizedCallbackUrls.filter((u) => u !== url))}><X className="h-2 w-2" /></Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

          </div>
      </div>

      <AuthConfigModal
        open={authConfigModalOpen}
        onOpenChange={setAuthConfigModalOpen}
        mode="select"
        onSelect={handleUseExistingAuthConfig}
        projectName={config.projectName || project?.project_id}
        apiVersion={config.apiVersion || project?.api_version || '1.0.0'}
      />

      {/* Simple Auth Config Name Selection Modal */}
      <Dialog open={authConfigSelectModalOpen} onOpenChange={setAuthConfigSelectModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Auth Config</DialogTitle>
            <DialogDescription>
              Select an existing auth config to reuse its name
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {loadingAuthConfigs ? (
              <div className="text-sm text-muted-foreground text-center py-4">Loading auth configs...</div>
            ) : existingAuthConfigs.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">No auth configs found</div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {existingAuthConfigs.map((pool) => (
                  <Button
                    key={pool.id}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => {
                      updateConfig({ userGroupName: pool.name, authConfigId: pool.id, useAuthConfig: true });
                      setSelectedAuthConfigId(pool.id);
                      setAuthConfigSelectModalOpen(false);
                    }}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    {pool.name}
                  </Button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuthConfigSelectModalOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
