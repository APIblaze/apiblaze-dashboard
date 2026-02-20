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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlertCircle, Plus, X, Users, Key, Copy, Check, Search, ChevronDown, Star, ExternalLink, Loader2, Pencil, HelpCircle } from 'lucide-react';
import { ProjectConfig, SocialProvider } from './types';
import { useState, useEffect, useRef, useMemo } from 'react';
import { AuthConfigModal } from '@/components/auth-config/auth-config-modal';
import { api } from '@/lib/api';
import { updateProjectConfig } from '@/lib/api/projects';
import { useDashboardCacheStore } from '@/store/dashboard-cache';
import type { AppClient, AuthConfig, SocialProvider as AuthConfigSocialProvider } from '@/types/auth-config';
import type { Project } from '@/types/project';
import { getFirstExternalCallbackUrl, buildAppLoginAuthorizeUrl } from '@/lib/build-app-login-url';
import { addPkceToAuthorizeUrl } from '@/lib/add-pkce-to-url';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';

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

/** Min length required by the provider API (admin-api providers route) */
const CLIENT_SECRET_MIN_LENGTH = 6;

const PROVIDER_DOMAINS: Record<SocialProvider, string> = {
  google: 'https://accounts.google.com',
  microsoft: 'https://login.microsoftonline.com',
  github: 'https://github.com',
  facebook: 'https://www.facebook.com',
  auth0: 'https://YOUR_DOMAIN.auth0.com',
  other: '',
};

const PRESET_COLORS = [
  '#101727', '#FFFFFF', '#F3F4F6', '#E5E7EB', '#D1D5DB', '#9CA3AF', '#6B7280',
  '#2563eb', '#1d4ed8', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe',
  '#059669', '#047857', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0',
  '#0891b2', '#0e7490', '#06b6d4', '#22d3ee', '#67e8f9', '#a5f3fc',
  '#7c3aed', '#6d28d9', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe',
  '#db2777', '#be185d', '#ec4899', '#f472b6', '#f9a8d4', '#fbcfe8',
];

/** Default scopes per provider type (e.g. for project create/add provider) */
const DEFAULT_SCOPES: Record<SocialProvider, string[]> = {
  google: ['email', 'offline_access', 'openid', 'profile'],
  github: ['read:user', 'user:email'],
  microsoft: ['email', 'offline_access', 'openid', 'profile'],
  facebook: ['email', 'public_profile'],
  auth0: ['offline_access', 'openid', 'profile', 'email'],
  other: ['offline_access', 'openid', 'profile'],
};

function getDefaultNewProvider(type: SocialProvider = 'google') {
  return {
    type,
    clientId: '',
    clientSecret: '',
    domain: PROVIDER_DOMAINS[type],
    tokenType: 'apiblaze' as const,
    targetServerToken: 'apiblaze' as const,
    includeApiblazeAccessTokenHeader: false,
    includeApiblazeIdTokenHeader: false,
    scopes: [...DEFAULT_SCOPES[type]],
  };
}

const PROVIDER_TYPE_LABELS: Record<SocialProvider, string> = {
  google: 'Google',
  github: 'GitHub',
  microsoft: 'Microsoft',
  facebook: 'Facebook',
  auth0: 'Auth0',
  other: 'Other',
};

/** APIBlaze default GitHub OAuth client ID - used to show "API Blaze via GitHub" in provider list. From env or known default. */
const APIBLAZE_GITHUB_CLIENT_ID = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_APIBLAZE_GITHUB_CLIENT_ID?.trim()) || 'Iv23liwZOuwO0lPP9R9P';

function isApiblazeDefaultProvider(provider: { type: string; clientId?: string; client_id?: string; isApiblazeDefault?: boolean }): boolean {
  if (provider.type !== 'github') return false;
  if (provider.isApiblazeDefault === true) return true;
  const clientId = (provider.clientId ?? provider.client_id ?? '').trim();
  return !!APIBLAZE_GITHUB_CLIENT_ID && clientId === APIBLAZE_GITHUB_CLIENT_ID;
}

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
  const { toast } = useToast();
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
  const appClients = useMemo(
    () => (currentAuthConfigId ? getAppClients(currentAuthConfigId) : []),
    [currentAuthConfigId, getAppClients]
  );
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
    scopes: string[];
  }>>({});
  const [newAuthorizedScopeByClient, setNewAuthorizedScopeByClient] = useState<Record<string, string>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<Record<string, boolean>>({});
  const [expiryValues, setExpiryValues] = useState<Record<string, {
    accessTokenExpiry: number;
    refreshTokenExpiry: number;
    idTokenExpiry: number;
  }>>({});
  const [newCallbackUrlByClient, setNewCallbackUrlByClient] = useState<Record<string, string>>({});
  const [savingCallbackUrlsForClient, setSavingCallbackUrlsForClient] = useState<string | null>(null);
  type EditAppClientForm = {
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
    loginPageLogo: string;
    loginPageHeaderText: string;
    loginPageSubtitle: string;
    primaryColor: string;
    useGradient: boolean;
  };
  const buildFormFromClient = (client: AppClient, details?: AppClientResponse): EditAppClientForm => {
    const d = details ?? (client as AppClientResponse);
    const urls = (d?.authorizedCallbackUrls ?? (d as { authorized_callback_urls?: string[] })?.authorized_callback_urls ?? []) as string[];
    const b = (d as AppClientResponse)?.branding;
    return {
      name: client.name,
      authorizedCallbackUrls: urls,
      newUrl: '',
      refreshTokenExpiry: details?.refreshTokenExpiry ?? 2592000,
      idTokenExpiry: details?.idTokenExpiry ?? 3600,
      accessTokenExpiry: details?.accessTokenExpiry ?? 3600,
      signoutUris: (details?.signoutUris ?? details?.signout_uris ?? []) as string[],
      newSignoutUri: '',
      scopes: (details?.scopes ?? ['email', 'offline_access', 'openid', 'profile']) as string[],
      newScope: '',
      loginPageLogo: b?.loginPageLogo ?? '',
      loginPageHeaderText: b?.loginPageHeaderText ?? '',
      loginPageSubtitle: b?.loginPageSubtitle ?? '',
      primaryColor: b?.primaryColor ?? '#101727',
      useGradient: b?.useGradient ?? false,
    };
  };
  const [editAppClientForms, setEditAppClientForms] = useState<Record<string, EditAppClientForm>>({});
  const [savingAppClientId, setSavingAppClientId] = useState<string | null>(null);
  const [colorPopoverOpenClientId, setColorPopoverOpenClientId] = useState<string | null>(null);
  const [appLoginUrlWithPkce, setAppLoginUrlWithPkce] = useState<Record<string, { type: string; url: string }[]>>({});
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
    scopes: string[];
  } | null>(null);
  const [editProviderNewScope, setEditProviderNewScope] = useState('');
  const [newProviderSecretOverride, setNewProviderSecretOverride] = useState('');
  const [savingProviderEdit, setSavingProviderEdit] = useState(false);
  const [loadingProviderSecret, setLoadingProviderSecret] = useState(false);

  // Generate PKCE example URLs for "Your App login URLs" links (one URL per provider so auth redirects to that provider)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, { type: string; url: string }[]> = {};
      for (const client of appClients) {
        const details = appClientDetails[client.id] as AppClientResponse | undefined;
        const urls = (details?.authorizedCallbackUrls ?? details?.authorized_callback_urls ?? []) as string[];
        const external = getFirstExternalCallbackUrl(urls);
        if (!external) continue;
        const oauthClientId = details?.clientId ?? details?.client_id ?? client.clientId ?? client.id;
        const scopes = (details?.scopes ?? client.scopes ?? []) as string[];
        const providerList = currentAuthConfigId ? getProviders(currentAuthConfigId, client.id) : [];
        const list = providerList.length > 0 ? providerList : [{ type: '' }];
        const allBaseUrl = buildAppLoginAuthorizeUrl(oauthClientId, external, scopes, undefined);
        const allUrlWithPkce = await addPkceToAuthorizeUrl(allBaseUrl);
        if (cancelled) continue;
        const arr = await Promise.all(
          list.map(async (p) => {
            const baseUrl = buildAppLoginAuthorizeUrl(oauthClientId, external, scopes, p.type || undefined);
            const urlWithPkce = await addPkceToAuthorizeUrl(baseUrl);
            return { type: p.type, url: urlWithPkce };
          })
        );
        next[client.id] = list.length > 1 ? [{ type: 'all', url: allUrlWithPkce }, ...arr] : arr;
      }
      if (!cancelled) setAppLoginUrlWithPkce((prev) => ({ ...prev, ...next }));
    })();
    return () => { cancelled = true; };
  }, [appClients, appClientDetails, currentAuthConfigId, getProviders, providers]);

  const validateHttpsUrlForEdit = (url: string): { valid: boolean; error?: string } => {
    try {
      const urlObj = new URL(url);
      if (urlObj.protocol === 'https:') return { valid: true };
      if (urlObj.protocol === 'http:' && urlObj.hostname.toLowerCase() === 'localhost') {
        return { valid: true };
      }
      return { valid: false, error: 'URL must use HTTPS, or http://localhost for local development' };
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
      alert(err instanceof Error ? err.message : 'Failed to add callback URL');
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
      alert(err instanceof Error ? err.message : 'Failed to remove callback URL');
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

  // Initialize and sync edit forms from app client details (populate when API data arrives)
  useEffect(() => {
    setEditAppClientForms(prev => {
      let changed = false;
      const merged = { ...prev };
      for (const client of appClients) {
        const details = appClientDetails[client.id] as AppClientResponse | undefined;
        const built = buildFormFromClient(client, details);
        if (!(client.id in merged)) {
          merged[client.id] = built;
          changed = true;
        } else if (details) {
          const current = merged[client.id];
          const needsPopulate =
            (current.authorizedCallbackUrls.length === 0 && built.authorizedCallbackUrls.length > 0) ||
            (!current.loginPageLogo && built.loginPageLogo) ||
            (!current.loginPageHeaderText && built.loginPageHeaderText) ||
            (!current.loginPageSubtitle && built.loginPageSubtitle);
          if (needsPopulate) {
            merged[client.id] = built;
            changed = true;
          }
        }
      }
      return changed ? merged : prev;
    });
  }, [appClients, appClientDetails]);

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
    } catch {
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
        scopes: ['email', 'offline_access', 'openid', 'profile'],
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
      alert(error instanceof Error ? error.message : 'Failed to update token expiries');
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
    const provider = newProvider[clientId] ?? getDefaultNewProvider('google');
    if (!provider.clientId || !provider.clientSecret) {
      alert('Please provide Client ID and Client Secret');
      return;
    }
    const scopes = (provider as { scopes?: string[] }).scopes ?? [];
    if (!scopes.length) {
      alert('At least one scope is required (e.g. email, openid, profile for Google; read:user, user:email for GitHub)');
      return;
    }
    try {
      await api.addProvider(selectedAuthConfigId, clientId, {
        type: provider.type,
        clientId: provider.clientId,
        clientSecret: provider.clientSecret,
        scopes,
        domain: provider.domain || PROVIDER_DOMAINS[provider.type],
        tokenType: provider.tokenType || 'apiblaze',
        targetServerToken: provider.targetServerToken ?? 'apiblaze',
        includeApiblazeAccessTokenHeader: provider.includeApiblazeAccessTokenHeader ?? (provider as { include_apiblaze_access_token_header?: boolean }).include_apiblaze_access_token_header ?? (provider as { include_apiblaze_token_header?: boolean }).include_apiblaze_token_header ?? false,
        includeApiblazeIdTokenHeader: provider.includeApiblazeIdTokenHeader ?? (provider as { include_apiblaze_id_token_header?: boolean }).include_apiblaze_id_token_header ?? false,
      });
      
      await invalidateAndRefetch(teamId);
      setNewAuthorizedScopeByClient(prev => ({ ...prev, [clientId]: '' }));
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

  const saveAppClientEdit = async (clientId: string) => {
    const form = editAppClientForms[clientId];
    if (!currentAuthConfigId || !form) return;
    if (!form.name.trim()) {
      alert('Name is required');
      return;
    }
    setSavingAppClientId(clientId);
    try {
      const brandingPayload =
        form.loginPageLogo.trim() ||
        form.loginPageHeaderText.trim() ||
        form.loginPageSubtitle.trim() ||
        (form.primaryColor && form.primaryColor !== '#101727') ||
        form.useGradient
          ? {
              loginPageLogo: form.loginPageLogo.trim() || undefined,
              loginPageHeaderText: form.loginPageHeaderText.trim() || undefined,
              loginPageSubtitle: form.loginPageSubtitle.trim() || undefined,
              primaryColor: form.primaryColor !== '#101727' ? form.primaryColor : undefined,
              useGradient: form.useGradient,
            }
          : undefined;
      await api.updateAppClient(currentAuthConfigId, clientId, {
        name: form.name.trim(),
        authorizedCallbackUrls: form.authorizedCallbackUrls,
        refreshTokenExpiry: form.refreshTokenExpiry,
        idTokenExpiry: form.idTokenExpiry,
        accessTokenExpiry: form.accessTokenExpiry,
        signoutUris: form.signoutUris,
        scopes: form.scopes,
        branding: brandingPayload,
      });
      await invalidateAndRefetch(teamId);
      setColorPopoverOpenClientId(null);
    } catch (err) {
      console.error('Error updating app client:', err);
      alert(err instanceof Error ? err.message : 'Failed to update app client');
    } finally {
      setSavingAppClientId(null);
    }
  };

  const cancelAppClientEdit = (clientId: string) => {
    const client = appClients.find(c => c.id === clientId);
    const details = appClientDetails[clientId] as AppClientResponse | undefined;
    if (client) {
      setEditAppClientForms(prev => ({ ...prev, [clientId]: buildFormFromClient(client, details) }));
    }
    setColorPopoverOpenClientId(null);
  };

  const updateAppClientForm = (clientId: string, updates: Partial<EditAppClientForm>) => {
    setEditAppClientForms(prev => {
      const form = prev[clientId];
      if (!form) return prev;
      return { ...prev, [clientId]: { ...form, ...updates } };
    });
  };

  const startEditProvider = async (clientId: string, provider: SocialProviderResponse) => {
    setEditingProviderKey(`${clientId}:${provider.id}`);
    setEditProviderNewScope('');
    setNewProviderSecretOverride('');
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
    const rawScopes = provider.scopes ?? (provider as { authorized_scopes?: string | string[] }).authorized_scopes;
    const scopes = Array.isArray(rawScopes)
      ? rawScopes
      : typeof rawScopes === 'string' && rawScopes.trim()
        ? rawScopes.trim().split(/\s+/).filter(Boolean)
        : DEFAULT_SCOPES[provider.type];
    setEditProviderForm({
      type: provider.type,
      clientId: provider.clientId ?? (provider as { client_id?: string }).client_id ?? '',
      clientSecret: secret,
      domain: provider.domain ?? PROVIDER_DOMAINS[provider.type],
      tokenType: ((provider.tokenType ?? (provider as { token_type?: string }).token_type) ?? 'apiblaze') as 'apiblaze' | 'thirdParty',
      targetServerToken: (provider.targetServerToken ?? (provider as { target_server_token?: string }).target_server_token ?? 'apiblaze') as 'apiblaze' | 'third_party_access_token' | 'third_party_id_token' | 'none',
      includeApiblazeAccessTokenHeader: provider.includeApiblazeAccessTokenHeader ?? (provider as { include_apiblaze_access_token_header?: boolean }).include_apiblaze_access_token_header ?? (provider as { include_apiblaze_token_header?: boolean }).include_apiblaze_token_header ?? false,
      includeApiblazeIdTokenHeader: provider.includeApiblazeIdTokenHeader ?? (provider as { include_apiblaze_id_token_header?: boolean }).include_apiblaze_id_token_header ?? false,
      scopes,
    });
  };

  const saveProviderEdit = async () => {
    if (!currentAuthConfigId || !editingProviderKey || !editProviderForm) return;
    const [clientId, providerId] = editingProviderKey.split(':');
    const secretToSend = newProviderSecretOverride.trim() || editProviderForm.clientSecret.trim();
    if (!editProviderForm.clientId.trim() || !secretToSend) {
      alert('Client ID and Client Secret are required');
      return;
    }
    if (secretToSend.length > 0 && secretToSend.length < CLIENT_SECRET_MIN_LENGTH) {
      alert(`Client secret must be at least ${CLIENT_SECRET_MIN_LENGTH} characters.`);
      return;
    }
    if (!editProviderForm.scopes?.length) {
      alert('At least one authorized scope is required');
      return;
    }
    setSavingProviderEdit(true);
    try {
      await api.updateProvider(currentAuthConfigId, clientId, providerId, {
        type: editProviderForm.type,
        clientId: editProviderForm.clientId.trim(),
        clientSecret: secretToSend,
        scopes: editProviderForm.scopes ?? [],
        domain: editProviderForm.domain.trim() || undefined,
        tokenType: editProviderForm.tokenType,
        targetServerToken: editProviderForm.targetServerToken,
        includeApiblazeAccessTokenHeader: editProviderForm.includeApiblazeAccessTokenHeader,
        includeApiblazeIdTokenHeader: editProviderForm.includeApiblazeIdTokenHeader,
      });
      await invalidateAndRefetch(teamId);
      setEditingProviderKey(null);
      setEditProviderForm(null);
      setNewProviderSecretOverride('');
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
    setEditProviderNewScope('');
    setNewProviderSecretOverride('');
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
        if (field.startsWith('appLogin-')) {
          toast({
            title: 'Copied',
            description: 'Generate your own code_verifier and code_challenge (PKCE) for each request, then replace the example in the link before using in production.',
          });
        }
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
        if (field.startsWith('appLogin-')) {
          toast({
            title: 'Copied',
            description: 'Generate your own code_verifier and code_challenge (PKCE) for each request, then replace the example in the link before using in production.',
          });
        }
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
        if (field.startsWith('appLogin-')) {
          toast({
            title: 'Copied',
            description: 'Generate your own code_verifier and code_challenge (PKCE) for each request, then replace the example in the link before using in production.',
          });
        }
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
                    className="mt-1 bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Authorized Callback URLs</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newAuthorizedCallbackUrl}
                      onChange={(e) => setNewAuthorizedCallbackUrl(e.target.value)}
                      placeholder="https://example.com/callback"
                      className="text-xs bg-white"
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
                        className="flex items-center gap-1 bg-white border border-gray-200 px-2 py-1 rounded text-xs"
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
                const form = editAppClientForms[client.id] ?? buildFormFromClient(client, clientDetails);
                return (
                  <div key={client.id} className="space-y-4">
                    {/* App Client Card - Always in edit mode */}
                    <Card className="border-2 border-blue-200 bg-blue-50/50">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm">Edit AppClient</CardTitle>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteAppClient(client.id)}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 shrink-0"
                              title="Delete app client"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {/* JWKS, Portal login & App login links - at top */}
                          <div className="space-y-3 pb-3 border-b border-blue-100">
                            {(() => {
                              const oauthClientId = clientDetails?.client_id || clientDetails?.clientId || client.clientId || client.id;
                              if (!oauthClientId) return null;
                              const jwksUrl = `https://auth.apiblaze.com/${oauthClientId}/.well-known/jwks.json`;
                              return (
                                <div className="space-y-1">
                                  <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">JWKS (RS256 Public Key)</div>
                                  <div className="flex items-center gap-2 min-w-0">
                                    <a
                                      href={jwksUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline truncate min-w-0"
                                      title={jwksUrl}
                                    >
                                      {jwksUrl}
                                    </a>
                                    <a href={jwksUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-blue-600 hover:text-blue-800" title="Open in new tab">
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </div>
                                </div>
                              );
                            })()}
                            {(() => {
                              const oauthClientId = clientDetails?.client_id || clientDetails?.clientId;
                              const projectName = project?.project_id || 'project';
                              const apiVersion = project?.api_version || '1.0.0';
                              const isDefault = config.defaultAppClient === client.id;
                              const portalUrl = isDefault
                                ? `https://${projectName}.portal.apiblaze.com/${apiVersion}`
                                : oauthClientId
                                  ? `https://${projectName}.portal.apiblaze.com/${apiVersion}/login?clientId=${oauthClientId}`
                                  : `https://${projectName}.portal.apiblaze.com/${apiVersion}/login`;
                              return (
                                <div className="space-y-1">
                                  <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">API Portal login</div>
                                  <div className="flex items-center gap-2 min-w-0">
                                    <a
                                      href={portalUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline truncate min-w-0"
                                      title={portalUrl}
                                    >
                                      {portalUrl}
                                    </a>
                                    <a href={portalUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-blue-600 hover:text-blue-800" title="Open in new tab">
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                    {!isDefault && project && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={async () => {
                                          updateConfig({ defaultAppClient: client.id });
                                          await saveConfigImmediately({ defaultAppClient: client.id });
                                        }}
                                        className="h-6 px-2 text-xs shrink-0"
                                        title="Set as default"
                                      >
                                        <Star className="h-3 w-3 mr-1" />
                                        Default
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                            {(() => {
                              const urls = getClientCallbackUrls(client.id);
                              const externalRedirect = getFirstExternalCallbackUrl(urls);
                              if (!externalRedirect) return null;
                              const loginUrls = appLoginUrlWithPkce[client.id];
                              const providerLabel = (t: string) => (t === 'all' ? 'All' : t ? t.charAt(0).toUpperCase() + t.slice(1) : '');
                              return (
                                <div className="space-y-1">
                                  <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                    Your App login URLs
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex text-muted-foreground hover:text-foreground cursor-help">
                                          <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-xs">
                                        <p>We generated an example code_challenge so this link opens the login page. For your own app you must generate your own code_verifier and code_challenge (PKCE) for each request. You can select which provider to link simply by adding the parameter provider=google or others to the url.</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                  {loginUrls && loginUrls.length > 0 ? (
                                    <div className="space-y-1.5">
                                      {loginUrls.map(({ type, url }) => (
                                        <div key={type || 'default'} className="flex items-center gap-2 min-w-0">
                                          <a
                                            href={url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-blue-600 hover:text-blue-800 hover:underline shrink-0"
                                          >
                                            Open login page ({providerLabel(type) || 'default'})
                                          </a>
                                          <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-blue-600 hover:text-blue-800" title="Open in new tab">
                                            <ExternalLink className="h-3 w-3" />
                                          </a>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0 shrink-0"
                                            onClick={async (e) => {
                                              e.preventDefault();
                                              await copyToClipboard(url, `appLogin-${client.id}-${type || 'default'}`);
                                            }}
                                            title="Copy URL"
                                          >
                                            {copiedField === `appLogin-${client.id}-${type || 'default'}` ? (
                                              <Check className="h-3 w-3 text-green-600" />
                                            ) : (
                                              <Copy className="h-3 w-3" />
                                            )}
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground italic">Generating…</span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                          <div>
                            <Label htmlFor={`editAppClientName-${client.id}`} className="text-xs">Name</Label>
                            <Input
                              id={`editAppClientName-${client.id}`}
                              value={form.name}
                              onChange={(e) => updateAppClientForm(client.id, { name: e.target.value })}
                              placeholder="my-app-client"
                              className="mt-1 bg-white"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">Authorized Callback URLs</Label>
                            <div className="flex gap-2">
                              <Input
                                value={form.newUrl}
                                onChange={(e) => updateAppClientForm(client.id, { newUrl: e.target.value })}
                                placeholder="https://example.com/callback"
                                className="text-xs bg-white"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (form.newUrl.trim()) {
                                      updateAppClientForm(client.id, { authorizedCallbackUrls: [...form.authorizedCallbackUrls, form.newUrl.trim()], newUrl: '' });
                                    }
                                  }
                                }}
                              />
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                  if (form.newUrl.trim()) {
                                    updateAppClientForm(client.id, { authorizedCallbackUrls: [...form.authorizedCallbackUrls, form.newUrl.trim()], newUrl: '' });
                                  }
                                }}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {form.authorizedCallbackUrls.map((url, index) => (
                                <div key={url} className="flex items-center gap-1 bg-white border border-gray-200 px-2 py-1 rounded text-xs">
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
                                    onClick={() => updateAppClientForm(client.id, { authorizedCallbackUrls: form.authorizedCallbackUrls.filter(u => u !== url) })}
                                  >
                                    <X className="h-2 w-2" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-2 pt-2 border-t border-blue-100">
                            <Label className="text-xs">Login Page Branding</Label>
                            <div className="space-y-2">
                              <div>
                                <Label className="text-xs text-muted-foreground">Logo URL</Label>
                                <Input
                                  placeholder="https://example.com/logo.png"
                                  value={form.loginPageLogo}
                                  onChange={(e) => updateAppClientForm(client.id, { loginPageLogo: e.target.value })}
                                  className="mt-1 text-xs font-mono bg-white"
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Header Text</Label>
                                <Input
                                  placeholder="Login into your App"
                                  value={form.loginPageHeaderText}
                                  onChange={(e) => updateAppClientForm(client.id, { loginPageHeaderText: e.target.value })}
                                  className="mt-1 text-xs bg-white"
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Subtitle</Label>
                                <Input
                                  placeholder="Get started now"
                                  value={form.loginPageSubtitle}
                                  onChange={(e) => updateAppClientForm(client.id, { loginPageSubtitle: e.target.value })}
                                  className="mt-1 text-xs bg-white"
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Primary Color</Label>
                                <Popover open={colorPopoverOpenClientId === client.id} onOpenChange={(open) => setColorPopoverOpenClientId(open ? client.id : null)}>
                                  <PopoverTrigger asChild>
                                    <button
                                      type="button"
                                      className="flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5 mt-1 hover:border-muted-foreground/50 hover:bg-muted/50 transition-colors text-left w-full max-w-[140px]"
                                    >
                                      <span
                                        className="h-6 w-6 rounded border border-border/60 shrink-0"
                                        style={{ backgroundColor: form.primaryColor || '#101727' }}
                                      />
                                      <span className="text-xs text-muted-foreground truncate">{form.primaryColor || '#101727'}</span>
                                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-auto" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-4" align="start">
                                    <p className="text-xs font-medium mb-3 text-muted-foreground">Choose color</p>
                                    <div className="grid grid-cols-6 gap-1.5 mb-4">
                                      {PRESET_COLORS.map((color) => (
                                        <button
                                          key={color}
                                          type="button"
                                          onClick={() => updateAppClientForm(client.id, { primaryColor: color })}
                                          className={`h-7 w-7 rounded-md border-2 flex items-center justify-center transition-all hover:scale-110 ${
                                            form.primaryColor === color ? 'border-foreground ring-2 ring-offset-1 ring-offset-background' : 'border-transparent hover:border-muted-foreground/50'
                                          }`}
                                          style={{ backgroundColor: color }}
                                          title={color}
                                        >
                                          {form.primaryColor === color && (
                                            <Check className={`h-3.5 w-3.5 ${['#FFFFFF', '#F3F4F6', '#E5E7EB', '#D1D5DB', '#9CA3AF', '#bfdbfe', '#a7f3d0', '#a5f3fc', '#ddd6fe', '#fbcfe8'].includes(color) ? 'text-gray-800' : 'text-white'}`} />
                                          )}
                                        </button>
                                      ))}
                                    </div>
                                    <div className="flex items-center justify-between pt-3 border-t border-border/60">
                                      <Label className="text-xs font-medium">Use gradient</Label>
                                      <Switch
                                        checked={form.useGradient}
                                        onCheckedChange={(checked) => updateAppClientForm(client.id, { useGradient: checked })}
                                      />
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              </div>
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
                              <div className="space-y-4 mt-3">
                                <div className="space-y-2">
                                  <Label className="text-xs">Token Expiry (seconds)</Label>
                                  <div className="grid grid-cols-3 gap-2">
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Refresh</Label>
                                      <Input
                                        type="number"
                                        value={form.refreshTokenExpiry}
                                        onChange={(e) => updateAppClientForm(client.id, { refreshTokenExpiry: parseInt(e.target.value, 10) || 2592000 })}
                                        className="mt-1 bg-white"
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs text-muted-foreground">ID Token</Label>
                                      <Input
                                        type="number"
                                        value={form.idTokenExpiry}
                                        onChange={(e) => updateAppClientForm(client.id, { idTokenExpiry: parseInt(e.target.value, 10) || 3600 })}
                                        className="mt-1 bg-white"
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Access</Label>
                                      <Input
                                        type="number"
                                        value={form.accessTokenExpiry}
                                        onChange={(e) => updateAppClientForm(client.id, { accessTokenExpiry: parseInt(e.target.value, 10) || 3600 })}
                                        className="mt-1 bg-white"
                                      />
                                    </div>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs">Scopes</Label>
                                  <p className="text-xs text-muted-foreground">
                                    Scopes for /authorize and /token; requested scopes must be a subset. Add or remove below.
                                  </p>
                                  <div className="flex flex-wrap gap-1 mb-2">
                                    {(form.scopes ?? []).map((scope) => (
                                      <Badge key={scope} variant="secondary" className="gap-1 text-xs">
                                        {scope}
                                        <button
                                          type="button"
                                          onClick={() => updateAppClientForm(client.id, { scopes: (form.scopes ?? []).filter((s) => s !== scope) })}
                                          className="ml-0.5 rounded hover:bg-muted"
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      </Badge>
                                    ))}
                                  </div>
                                  <div className="flex gap-2">
                                    <Input
                                      placeholder="e.g. openid, email, profile"
                                      value={form.newScope}
                                      onChange={(e) => updateAppClientForm(client.id, { newScope: e.target.value })}
                                      className="text-xs bg-white"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          const s = form.newScope.trim();
                                          if (s && !(form.scopes ?? []).includes(s)) {
                                            updateAppClientForm(client.id, { scopes: [...(form.scopes ?? []), s], newScope: '' });
                                          }
                                        }
                                      }}
                                    />
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-9"
                                      onClick={() => {
                                        const s = form.newScope.trim();
                                        if (s && !(form.scopes ?? []).includes(s)) {
                                          updateAppClientForm(client.id, { scopes: [...(form.scopes ?? []), s], newScope: '' });
                                        }
                                      }}
                                    >
                                      <Plus className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => saveAppClientEdit(client.id)}
                              disabled={savingAppClientId === client.id || !form.name.trim()}
                            >
                              {savingAppClientId === client.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                              Save
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => cancelAppClientEdit(client.id)}>
                              Cancel
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
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
                          onClick={() => {
                            setShowAddProvider(prev => ({ ...prev, [client.id]: !prev[client.id] }));
                            if (!newProvider[client.id]) {
                              setNewProvider(prev => ({ ...prev, [client.id]: getDefaultNewProvider('google') }));
                            }
                          }}
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
                                      ...getDefaultNewProvider(value as SocialProvider),
                                      clientId: prev[client.id]?.clientId || '',
                                      clientSecret: prev[client.id]?.clientSecret || '',
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
                                      ...(prev[client.id] || getDefaultNewProvider(prev[client.id]?.type || 'google')),
                                      domain: e.target.value
                                    }
                                  }))}
                                  placeholder="https://accounts.google.com"
                                  className="mt-1 bg-white"
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
                                      ...(prev[client.id] || getDefaultNewProvider(prev[client.id]?.type || 'google')),
                                      clientId: e.target.value
                                    }
                                  }))}
                                  placeholder="your-client-id"
                                  className="mt-1 bg-white"
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
                                      ...(prev[client.id] || getDefaultNewProvider(prev[client.id]?.type || 'google')),
                                      clientSecret: e.target.value
                                    }
                                  }))}
                                  placeholder="your-client-secret"
                                  className="mt-1 bg-white"
                                />
                                {(newProvider[client.id]?.clientSecret?.trim().length ?? 0) > 0 && (newProvider[client.id]?.clientSecret?.trim().length ?? 0) < CLIENT_SECRET_MIN_LENGTH && (
                                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3 flex-shrink-0" />
                                    Client secret must be at least {CLIENT_SECRET_MIN_LENGTH} characters. The API will reject shorter values.
                                  </p>
                                )}
                              </div>
                              <div>
                                <Label className="text-xs">Authorized Scopes</Label>
                                <p className="text-xs text-muted-foreground mb-1">
                                  Default mandatory scopes: {(newProvider[client.id]?.scopes ?? DEFAULT_SCOPES[newProvider[client.id]?.type || 'google']).join(', ') || '—'}
                                </p>
                                <div className="flex flex-wrap gap-1 mb-2">
                                  {(newProvider[client.id]?.scopes ?? []).map((scope) => (
                                    <Badge key={scope} variant="secondary" className="gap-1 text-xs">
                                      {scope}
                                      <button
                                        type="button"
                                        onClick={() => setNewProvider(prev => ({
                                          ...prev,
                                          [client.id]: {
                                            ...(prev[client.id] || getDefaultNewProvider(prev[client.id]?.type || 'google')),
                                            scopes: (prev[client.id]?.scopes ?? []).filter((s) => s !== scope),
                                          }
                                        }))}
                                        className="ml-0.5 rounded hover:bg-muted"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </Badge>
                                  ))}
                                </div>
                                <div className="flex gap-2">
                                  <Input
                                    placeholder="Add custom scope"
                                    value={newAuthorizedScopeByClient[client.id] ?? ''}
                                    onChange={(e) => setNewAuthorizedScopeByClient(prev => ({ ...prev, [client.id]: e.target.value }))}
                                    className="mt-1 text-xs bg-white"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        const s = (newAuthorizedScopeByClient[client.id] ?? '').trim();
                                        if (s && !(newProvider[client.id]?.scopes ?? []).includes(s)) {
                                          setNewProvider(prev => ({
                                            ...prev,
                                            [client.id]: {
                                              ...(prev[client.id] || getDefaultNewProvider(prev[client.id]?.type || 'google')),
                                              scopes: [...(prev[client.id]?.scopes ?? []), s],
                                            }
                                          }));
                                          setNewAuthorizedScopeByClient(prev => ({ ...prev, [client.id]: '' }));
                                        }
                                      }
                                    }}
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-9"
                                    onClick={() => {
                                      const s = (newAuthorizedScopeByClient[client.id] ?? '').trim();
                                      if (s && !(newProvider[client.id]?.scopes ?? []).includes(s)) {
                                        setNewProvider(prev => ({
                                          ...prev,
                                          [client.id]: {
                                            ...(prev[client.id] || getDefaultNewProvider(prev[client.id]?.type || 'google')),
                                            scopes: [...(prev[client.id]?.scopes ?? []), s],
                                          }
                                        }));
                                        setNewAuthorizedScopeByClient(prev => ({ ...prev, [client.id]: '' }));
                                      }
                                    }}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
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
                                      ...(prev[client.id] || getDefaultNewProvider(prev[client.id]?.type || 'google')),
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
                                      ...(prev[client.id] || getDefaultNewProvider(prev[client.id]?.type || 'google')),
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
                                            ...(prev[client.id] || getDefaultNewProvider(prev[client.id]?.type || 'google')),
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
                                            ...(prev[client.id] || getDefaultNewProvider(prev[client.id]?.type || 'google')),
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
                                  disabled={!newProvider[client.id]?.clientId || !newProvider[client.id]?.clientSecret || !(newProvider[client.id]?.scopes?.length)}
                                >
                                  Add Provider
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setShowAddProvider(prev => ({ ...prev, [client.id]: false }));
                                    setNewAuthorizedScopeByClient(prev => ({ ...prev, [client.id]: '' }));
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
                                          className="mt-1 bg-white"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs">Client ID</Label>
                                        <Input
                                          value={editProviderForm.clientId}
                                          onChange={(e) => setEditProviderForm(prev => prev ? { ...prev, clientId: e.target.value } : null)}
                                          placeholder="your-client-id"
                                          className="mt-1 bg-white"
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label className="text-xs">Client Secret</Label>
                                        <div className="text-xs text-muted-foreground">
                                          {editProviderForm.clientSecret ? (
                                            <code className="bg-muted px-2 py-1 rounded font-mono">
                                              {editProviderForm.clientSecret.length <= 8
                                                ? '••••••••'
                                                : `${editProviderForm.clientSecret.substring(0, 4)}...${editProviderForm.clientSecret.substring(editProviderForm.clientSecret.length - 4)}`}
                                            </code>
                                          ) : (
                                            <span className="italic">No secret stored</span>
                                          )}
                                          <span className="ml-1">(only partial view; full secret never shown)</span>
                                        </div>
                                        <div>
                                          <Label className="text-xs text-muted-foreground">New client secret (leave blank to keep current)</Label>
                                          <Input
                                            type="password"
                                            value={newProviderSecretOverride}
                                            onChange={(e) => setNewProviderSecretOverride(e.target.value)}
                                            placeholder="Enter new secret to change"
                                            className="mt-1 bg-white"
                                          />
                                          {newProviderSecretOverride.trim().length > 0 && newProviderSecretOverride.trim().length < CLIENT_SECRET_MIN_LENGTH && (
                                            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                                              <AlertCircle className="h-3 w-3 flex-shrink-0" />
                                              Client secret must be at least {CLIENT_SECRET_MIN_LENGTH} characters. The API will reject shorter values.
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                      <div>
                                        <Label className="text-xs">Scopes</Label>
                                        <p className="text-xs text-muted-foreground mb-1">
                                          Authorized scopes that will get used to login your provider.
                                        </p>
                                        <div className="flex flex-wrap gap-1 mb-2">
                                          {(editProviderForm.scopes ?? []).map((scope) => (
                                            <Badge key={scope} variant="secondary" className="gap-1 text-xs">
                                              {scope}
                                              <button
                                                type="button"
                                                onClick={() => setEditProviderForm(prev => prev ? { ...prev, scopes: (prev.scopes ?? []).filter((s) => s !== scope) } : null)}
                                                className="ml-0.5 rounded hover:bg-muted"
                                              >
                                                <X className="h-3 w-3" />
                                              </button>
                                            </Badge>
                                          ))}
                                        </div>
                                        <div className="flex gap-2">
                                          <Input
                                            placeholder="Add custom scope"
                                            value={editProviderNewScope}
                                            onChange={(e) => setEditProviderNewScope(e.target.value)}
                                            className="mt-1 text-xs bg-white"
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                e.preventDefault();
                                                const s = editProviderNewScope.trim();
                                                if (s && !(editProviderForm.scopes ?? []).includes(s)) {
                                                  setEditProviderForm(prev => prev ? { ...prev, scopes: [...(prev.scopes ?? []), s] } : null);
                                                  setEditProviderNewScope('');
                                                }
                                              }
                                            }}
                                          />
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-9"
                                            onClick={() => {
                                              const s = editProviderNewScope.trim();
                                              if (s && !(editProviderForm.scopes ?? []).includes(s)) {
                                                setEditProviderForm(prev => prev ? { ...prev, scopes: [...(prev.scopes ?? []), s] } : null);
                                                setEditProviderNewScope('');
                                              }
                                            }}
                                          >
                                            <Plus className="h-4 w-4" />
                                          </Button>
                                        </div>
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
                                          disabled={savingProviderEdit || !editProviderForm.clientId.trim() || !(newProviderSecretOverride.trim() || editProviderForm.clientSecret.trim()) || !(editProviderForm.scopes?.length)}
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
                                      {isApiblazeDefaultProvider(provider)
                                        ? 'API Blaze via GitHub'
                                        : (PROVIDER_TYPE_LABELS[provider.type] ?? provider.type)}
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
  // Save config changes immediately to backend (for edit mode, e.g. default_app_client_id, auth_config)
  const saveProjectConfigImmediately = async (updates: {
    default_app_client_id?: string | null;
    auth_config?: { who_can_register?: 'anyone' | 'authorized_only' };
  }) => {
    if (!project) return;
    try {
      const configToSave: Record<string, unknown> = {};
      if (updates.default_app_client_id !== undefined) {
        configToSave.default_app_client_id = updates.default_app_client_id;
      }
      if (updates.auth_config !== undefined) {
        configToSave.auth_config = updates.auth_config;
      }
      if (Object.keys(configToSave).length > 0) {
        await updateProjectConfig(project.project_id, project.api_version, configToSave);
        const existingConfig = project.config as Record<string, unknown> | undefined;
        let mergedConfig: Record<string, unknown>;
        if (existingConfig) {
          mergedConfig = { ...existingConfig, ...configToSave };
          if (configToSave.auth_config) {
            mergedConfig.auth_config = {
              ...(existingConfig.auth_config as Record<string, unknown> || {}),
              ...configToSave.auth_config,
            };
          }
        } else {
          mergedConfig = configToSave;
        }
        if (onProjectUpdate) {
          onProjectUpdate({ ...project, config: mergedConfig });
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
      scopes: [...DEFAULT_SCOPES[provider]],
    });
  };

  const addScope = () => {
    if (newScope && !config.scopes.includes(newScope)) {
      updateConfig({
        scopes: [...config.scopes, newScope],
      });
      setNewScope('');
    }
  };

  const removeScope = (scope: string) => {
    const mandatoryForProvider = DEFAULT_SCOPES[config.socialProvider] ?? ['email', 'openid', 'profile'];
    if (mandatoryForProvider.includes(scope)) return; // Don't remove default scopes for this provider
    updateConfig({
      scopes: config.scopes.filter(s => s !== scope),
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
                            {(config.identityProviderClientSecret?.trim().length ?? 0) > 0 && (config.identityProviderClientSecret?.trim().length ?? 0) < CLIENT_SECRET_MIN_LENGTH && (
                              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3 flex-shrink-0" />
                                Client secret must be at least {CLIENT_SECRET_MIN_LENGTH} characters. The API will reject shorter values.
                              </p>
                            )}
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
                            <p className="text-xs text-muted-foreground mb-2">
                              Default scopes for {PROVIDER_TYPE_LABELS[config.socialProvider]}: {DEFAULT_SCOPES[config.socialProvider].join(', ')}
                            </p>
                            <div className="flex flex-wrap gap-2 mb-2">
                              {config.scopes.map((scope) => {
                                const mandatoryForProvider = DEFAULT_SCOPES[config.socialProvider] ?? ['email', 'openid', 'profile'];
                                return (
                                  <Badge key={scope} variant="secondary" className="text-xs">
                                    {scope}
                                    {!mandatoryForProvider.includes(scope) && (
                                      <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => removeScope(scope)} />
                                    )}
                                  </Badge>
                                );
                              })}
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

            {/* Who can register to login and use the API */}
            <div className="p-4 border rounded-lg bg-muted/30">
              <Label htmlFor="whoCanRegisterToLogin" className="text-sm font-medium">
                Who can register to login and use the API
              </Label>
              <Select
                value={config.whoCanRegisterToLogin ?? 'anyone'}
                onValueChange={(value) => {
                  const v = value as 'anyone' | 'authorized_only';
                  updateConfig({ whoCanRegisterToLogin: v });
                  if (isEditMode && project) {
                    saveProjectConfigImmediately({ auth_config: { who_can_register: v } });
                  }
                }}
              >
                <SelectTrigger id="whoCanRegisterToLogin" className="mt-2 w-fit min-w-[280px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anyone">Anyone</SelectItem>
                  <SelectItem value="authorized_only">Only users authorized in the API Portal or via the admin API</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
