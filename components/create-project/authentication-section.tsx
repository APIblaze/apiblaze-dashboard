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
import { AlertCircle, Plus, X, Users, Key, Copy, Check, Trash2, Search, ChevronDown, Star, ExternalLink, Loader2 } from 'lucide-react';
import { ProjectConfig, SocialProvider } from './types';
import { useState, useEffect, useRef, useMemo } from 'react';
import { AuthConfigModal } from '@/components/auth-config/auth-config-modal';
import { api } from '@/lib/api';
import { updateProjectConfig } from '@/lib/api/projects';
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
  onProjectUpdate?: (updatedProject: Project) => void; // Callback to update project in parent
  preloadedAuthConfigs?: AuthConfig[]; // Optional preloaded auth configs from parent
  preloadedAppClients?: Record<string, AppClient[]>; // Optional preloaded app clients keyed by authConfigId
  preloadedProviders?: Record<string, AuthConfigSocialProvider[]>; // Optional preloaded providers keyed by `${authConfigId}-${appClientId}`
  loadingAuthData?: boolean; // Loading state for auth data preloading
}

const PROVIDER_DOMAINS: Record<SocialProvider, string> = {
  google: 'https://accounts.google.com',
  microsoft: 'https://login.microsoftonline.com',
  github: 'https://github.com',
  facebook: 'https://www.facebook.com',
  auth0: 'https://YOUR_DOMAIN.auth0.com',
  other: '',
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
  preloadedAuthConfigs,
  preloadedAppClients,
  preloadedProviders,
  loadingAuthData
}: { 
  config: ProjectConfig; 
  updateConfig: (updates: Partial<ProjectConfig>) => void; 
  project?: Project | null;
  onProjectUpdate?: (updatedProject: Project) => void;
  initialAuthConfigId?: string;
  preloadedAuthConfigs?: AuthConfig[];
  preloadedAppClients?: Record<string, AppClient[]>;
  preloadedProviders?: Record<string, AuthConfigSocialProvider[]>;
  loadingAuthData?: boolean;
}) {
  // Save config changes immediately to backend (without redeployment)
  const saveConfigImmediately = async (updates: Partial<ProjectConfig>) => {
    if (!project) return; // Only save if we're in edit mode with an existing project
    
    try {
      // Extract only the defaultAppClient to save
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
  const authConfigId = useMemo(() => {
    if (initialAuthConfigId) {
      return initialAuthConfigId;
    }
    if (config.authConfigId) {
      return config.authConfigId;
    }
    if (project?.config) {
      const projectConfig = project.config as Record<string, unknown>;
      const id = projectConfig.auth_config_id as string | undefined;
      if (id) {
        return id;
      }
    }
    // If no authConfigId in project, but we have exactly one preloaded auth config, use it
    if (preloadedAuthConfigs && preloadedAuthConfigs.length === 1) {
      return preloadedAuthConfigs[0].id;
    }
    // Check if we have preloaded app clients - use the first key
    if (preloadedAppClients && Object.keys(preloadedAppClients).length === 1) {
      return Object.keys(preloadedAppClients)[0];
    }
    return undefined;
  }, [initialAuthConfigId, config.authConfigId, project?.config, preloadedAuthConfigs, preloadedAppClients]);

  // State
  const [authConfigs, setAuthConfigs] = useState<AuthConfig[]>(preloadedAuthConfigs || []);
  const [loadingAuthConfigs, setLoadingAuthConfigs] = useState(false);
  const [selectedAuthConfigId, setSelectedAuthConfigId] = useState<string | undefined>(authConfigId);
  
  // Memoize initial app clients and providers
  const initialAppClients = useMemo(() => {
    if (authConfigId && preloadedAppClients?.[authConfigId]) {
      return preloadedAppClients[authConfigId];
    }
    return [];
  }, [authConfigId, preloadedAppClients]);

  const initialProviders = useMemo(() => {
    const result: Record<string, SocialProviderResponse[]> = {};
    if (authConfigId && preloadedAppClients?.[authConfigId]) {
      preloadedAppClients[authConfigId].forEach((client) => {
        const key = `${authConfigId}-${client.id}`;
        if (preloadedProviders?.[key]) {
          result[client.id] = preloadedProviders[key] as SocialProviderResponse[];
        }
      });
    }
    return result;
  }, [authConfigId, preloadedAppClients, preloadedProviders]);
  
  // Update selectedAuthConfigId when authConfigId changes (e.g., when preloaded data arrives)
  useEffect(() => {
    if (authConfigId && authConfigId !== selectedAuthConfigId) {
      setSelectedAuthConfigId(authConfigId);
    }
  }, [authConfigId, selectedAuthConfigId]);
  const [appClients, setAppClients] = useState<AppClient[]>(initialAppClients);
  const [loadingAppClients, setLoadingAppClients] = useState(false);
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
  const [providers, setProviders] = useState<Record<string, SocialProviderResponse[]>>(initialProviders);
  const [loadingProviders, setLoadingProviders] = useState<Record<string, boolean>>({});
  const [showAddProvider, setShowAddProvider] = useState<Record<string, boolean>>({});
  const [newProvider, setNewProvider] = useState<Record<string, {
    type: SocialProvider;
    clientId: string;
    clientSecret: string;
    domain: string;
    tokenType: 'apiblaze' | 'thirdParty';
  }>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<Record<string, boolean>>({});
  const [expiryValues, setExpiryValues] = useState<Record<string, {
    accessTokenExpiry: number;
    refreshTokenExpiry: number;
    idTokenExpiry: number;
  }>>({});

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

  const loadAuthConfigs = async () => {
    setLoadingAuthConfigs(true);
    try {
      const pools = await api.listAuthConfigs();
      setAuthConfigs(Array.isArray(pools) ? pools : []);
    } catch (error) {
      console.error('Error loading auth configs:', error);
      setAuthConfigs([]);
    } finally {
      setLoadingAuthConfigs(false);
    }
  };

  const loadAppClientDetails = async (authConfigId: string, clientId: string) => {
    setLoadingAppClientDetails(prev => ({ ...prev, [clientId]: true }));
    try {
      const client = await api.getAppClient(authConfigId, clientId);
      setAppClientDetails(prev => ({
        ...prev,
        [clientId]: client
      }));
      if (client.clientSecret) {
        setRevealedSecrets(prev => ({
          ...prev,
          [clientId]: client.clientSecret || ''
        }));
      }
      setExpiryValues(prev => ({
        ...prev,
        [clientId]: {
          accessTokenExpiry: client.accessTokenExpiry || 3600,
          refreshTokenExpiry: client.refreshTokenExpiry || 2592000,
          idTokenExpiry: client.idTokenExpiry || 3600,
        }
      }));
    } catch (error) {
      console.error('Error loading app client details:', error);
    } finally {
      setLoadingAppClientDetails(prev => ({ ...prev, [clientId]: false }));
    }
  };

  const loadProviders = async (authConfigId: string, clientId: string, showLoading = true) => {
    const preloadKey = `${authConfigId}-${clientId}`;
    if (preloadedProviders?.[preloadKey] && preloadedProviders[preloadKey].length > 0) {
      setProviders(prev => ({
        ...prev,
        [clientId]: preloadedProviders[preloadKey] as SocialProviderResponse[]
      }));
      return;
    }
    
    if (showLoading) {
      setLoadingProviders(prev => ({ ...prev, [clientId]: true }));
    }
    try {
      const providerList = await api.listProviders(authConfigId, clientId);
      setProviders(prev => ({
        ...prev,
        [clientId]: Array.isArray(providerList) ? providerList : []
      }));
    } catch (error) {
      console.error('Error loading providers:', error);
      setProviders(prev => ({
        ...prev,
        [clientId]: []
      }));
    } finally {
      if (showLoading) {
        setLoadingProviders(prev => ({ ...prev, [clientId]: false }));
      }
    }
  };

  // ONE simple useEffect to load everything
  useEffect(() => {
    const currentAuthConfigId = authConfigId || selectedAuthConfigId;
    
    if (!currentAuthConfigId) {
      return;
    }

    // Set selectedAuthConfigId if not set
    if (!selectedAuthConfigId && currentAuthConfigId) {
      setSelectedAuthConfigId(currentAuthConfigId);
    }

    // Use preloaded data if available
    const preloadedClients = preloadedAppClients?.[currentAuthConfigId];
    if (preloadedClients && preloadedClients.length > 0) {
      console.log('[AuthSection] ✅ Using preloaded data for authConfigId:', currentAuthConfigId);
      setAppClients(preloadedClients);
      
      // Set providers from preloaded data
      const providersMap: Record<string, SocialProviderResponse[]> = {};
      preloadedClients.forEach((client) => {
        const key = `${currentAuthConfigId}-${client.id}`;
        if (preloadedProviders?.[key]) {
          providersMap[client.id] = preloadedProviders[key] as SocialProviderResponse[];
        }
      });
      setProviders(providersMap);
      
      // Load app client details for display
      preloadedClients.forEach((client) => {
        loadAppClientDetails(currentAuthConfigId, client.id);
      });
      
      // Sync config from preloaded auth config
      const preloadedAuthConfig = preloadedAuthConfigs?.find(ac => ac.id === currentAuthConfigId);
      if (preloadedAuthConfig) {
        updateConfig({ 
          authConfigId: currentAuthConfigId, 
          useAuthConfig: true,
          userGroupName: preloadedAuthConfig.name, // Set the auth config name
          enableSocialAuth: preloadedAuthConfig.enableSocialAuth || false,
          enableApiKey: preloadedAuthConfig.enableApiKeyAuth || false,
          bringOwnProvider: preloadedAuthConfig.bringMyOwnOAuth || false,
        });
      }
      return;
    }

    // No preloaded data - load from API
    if (appClients.length === 0 && !loadingAppClients) {
      console.log('[AuthSection] 📡 Loading from API for authConfigId:', currentAuthConfigId);
      setLoadingAppClients(true);
      api.listAppClients(currentAuthConfigId)
        .then(clients => {
          const clientsArray = Array.isArray(clients) ? clients : [];
          setAppClients(clientsArray);
          
          // Load providers and details for all clients
          clientsArray.forEach((client) => {
            loadProviders(currentAuthConfigId, client.id, false);
            loadAppClientDetails(currentAuthConfigId, client.id);
          });
        })
        .catch(error => {
          console.error('[AuthSection] ❌ Error loading app clients:', error);
          setAppClients([]);
        })
        .finally(() => {
          setLoadingAppClients(false);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authConfigId, selectedAuthConfigId]);

  // Load auth configs if not preloaded
  useEffect(() => {
    if (preloadedAuthConfigs && preloadedAuthConfigs.length > 0) {
      setAuthConfigs(preloadedAuthConfigs);
    } else if (authConfigs.length === 0) {
      loadAuthConfigs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloadedAuthConfigs]);


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
      });
      
      // Add the new client to the state immediately so it appears right away
      // The API should return a full AppClient object
      const clientToAdd = newClient as AppClient;
      const updatedClients = [...appClients, clientToAdd];
      setAppClients(updatedClients);
      
      // Load details and providers for the new client
      const clientId = clientToAdd.id;
      loadAppClientDetails(selectedAuthConfigId, clientId);
      loadProviders(selectedAuthConfigId, clientId, false);
      
      // If this is the only app client (or no default is set), make it the default
      if (updatedClients.length === 1 || !config.defaultAppClient) {
        updateConfig({ defaultAppClient: clientId });
        await saveConfigImmediately({ defaultAppClient: clientId });
      }
      
      // Refresh the list by reloading from API
      setLoadingAppClients(true);
      try {
        const clients = await api.listAppClients(selectedAuthConfigId);
        const clientsArray = Array.isArray(clients) ? clients : [];
        setAppClients(clientsArray);
        clientsArray.forEach((client) => {
          loadProviders(selectedAuthConfigId, client.id, false);
          loadAppClientDetails(selectedAuthConfigId, client.id);
        });
      } catch (error) {
        console.error('Error refreshing app clients:', error);
      } finally {
        setLoadingAppClients(false);
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
      
      // Reload app client details to reflect the update
      await loadAppClientDetails(selectedAuthConfigId, clientId);
    } catch (error) {
      console.error('Error updating app client expiries:', error);
      alert('Failed to update token expiries');
    }
  };

  const handleDeleteAppClient = async (clientId: string) => {
    if (!selectedAuthConfigId) return;
    if (!confirm('Are you sure you want to delete this AppClient? This action cannot be undone.')) return;
    
    try {
      await api.deleteAppClient(selectedAuthConfigId, clientId);
      
      // Check if the deleted client was the default
      const wasDefault = config.defaultAppClient === clientId;
      
      // Remove from state
      const remainingClients = appClients.filter(c => c.id !== clientId);
      setAppClients(remainingClients);
      setAppClientDetails(prev => {
        const next = { ...prev };
        delete next[clientId];
        return next;
      });
      setProviders(prev => {
        const next = { ...prev };
        delete next[clientId];
        return next;
      });
      
      // Handle default app client reassignment
      // One app client must always be the default
      if (wasDefault) {
        if (remainingClients.length > 0) {
          // Set the first remaining app client as default
          const newDefault = remainingClients[0].id;
          updateConfig({ defaultAppClient: newDefault });
          // Save immediately if in edit mode
          await saveConfigImmediately({ defaultAppClient: newDefault });
        } else {
          // No app clients left - this shouldn't happen in practice, but clear default if it does
          updateConfig({ defaultAppClient: undefined });
          // Save immediately if in edit mode
          await saveConfigImmediately({ defaultAppClient: undefined });
        }
      } else if (remainingClients.length === 1 && !config.defaultAppClient) {
        // If there's only one app client left and no default is set, make it the default
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
    const provider = newProvider[clientId];
    if (!provider || !provider.clientId || !provider.clientSecret) {
      alert('Please provide Client ID and Client Secret');
      return;
    }
    
    try {
      await api.addProvider(selectedAuthConfigId, clientId, {
        type: provider.type,
        clientId: provider.clientId,
        clientSecret: provider.clientSecret,
        domain: provider.domain || PROVIDER_DOMAINS[provider.type],
        tokenType: provider.tokenType || 'thirdParty',
      });
      
      await loadProviders(selectedAuthConfigId, clientId);
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
      await loadProviders(selectedAuthConfigId, clientId);
    } catch (error) {
      console.error('Error deleting provider:', error);
      alert('Failed to delete provider');
    }
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

  // Determine if we're still loading initial data  
  const currentAuthConfigIdForLoading = authConfigId || selectedAuthConfigId;
  const isLoadingInitialData = loadingAuthData || 
    (currentAuthConfigIdForLoading && 
     (!preloadedAppClients?.[currentAuthConfigIdForLoading] || 
      preloadedAppClients[currentAuthConfigIdForLoading].length === 0) &&
     appClients.length === 0 && !loadingAppClients);

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
                const isLoadingProviders = loadingProviders[client.id];
                const isShowingAddProvider = showAddProvider[client.id];
                return (
                  <div key={client.id} className="space-y-4">
                    {/* App Client Card - More prominent styling */}
                    <Card className="border-2 border-blue-200 bg-blue-50/30 shadow-sm">
                      <CardContent className="p-4">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Key className="h-4 w-4 text-blue-600" />
                              <div>
                                <div className="font-semibold text-base">{client.name}</div>
                                {/* JWKS Display */}
                                {clientDetails?.jwks && (() => {
                                  const clientId = clientDetails?.client_id || clientDetails?.clientId;
                                  const projectName = project?.project_id || 'project';
                                  const apiVersion = project?.api_version || '1.0.0';
                                  const jwksUrl = `https://${projectName}.auth.apiblaze.com/${apiVersion}/${clientId}/.well-known/jwk.json`;
                                  
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
                                      {isDefault ? (
                                        <Badge variant="default" className="bg-yellow-500 hover:bg-yellow-600 text-xs ml-1">
                                          <Star className="h-3 w-3 mr-1" />
                                          Default
                                        </Badge>
                                      ) : (
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
                          )}
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
                                      tokenType: prev[client.id]?.tokenType || 'thirdParty',
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
                                  value={newProvider[client.id]?.domain || ''}
                                  onChange={(e) => setNewProvider(prev => ({
                                    ...prev,
                                    [client.id]: {
                                      ...(prev[client.id] || { type: 'google', clientId: '', clientSecret: '', domain: '', tokenType: 'thirdParty' }),
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
                                      ...(prev[client.id] || { type: 'google', clientId: '', clientSecret: '', domain: '', tokenType: 'thirdParty' }),
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
                                      ...(prev[client.id] || { type: 'google', clientId: '', clientSecret: '', domain: '', tokenType: 'thirdParty' }),
                                      clientSecret: e.target.value
                                    }
                                  }))}
                                  placeholder="your-client-secret"
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label htmlFor={`providerTokenType-${client.id}`} className="text-xs">Token Type</Label>
                                <Select
                                  value={newProvider[client.id]?.tokenType || 'thirdParty'}
                                  onValueChange={(value) => setNewProvider(prev => ({
                                    ...prev,
                                    [client.id]: {
                                      ...(prev[client.id] || { type: 'google', clientId: '', clientSecret: '', domain: '', tokenType: 'thirdParty' }),
                                      tokenType: value as 'apiblaze' | 'thirdParty'
                                    }
                                  }))}
                                >
                                  <SelectTrigger className="mt-1">
                                    <SelectValue>
                                      {newProvider[client.id]?.tokenType === 'apiblaze' 
                                        ? 'APIBlaze' 
                                        : `${(newProvider[client.id]?.type || 'google').charAt(0).toUpperCase() + (newProvider[client.id]?.type || 'google').slice(1)} token`}
                                    </SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="apiblaze">APIBlaze</SelectItem>
                                    <SelectItem value="thirdParty">
                                      {(newProvider[client.id]?.type || 'google').charAt(0).toUpperCase() + (newProvider[client.id]?.type || 'google').slice(1)} token
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
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

                      {isLoadingProviders && clientProviders.length === 0 ? (
                        <div className="text-xs text-muted-foreground py-2">Loading providers...</div>
                      ) : clientProviders.length === 0 ? (
                        <div className="text-xs text-muted-foreground italic py-2">No providers configured. The default APIBlaze Github login will be used.</div>
                      ) : (
                        <div className="space-y-2">
                          {clientProviders.map((provider) => (
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
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteProvider(client.id, provider.id)}
                                className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0 ml-2"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
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

export function AuthenticationSection({ config, updateConfig, isEditMode = false, project, onProjectUpdate, preloadedAuthConfigs, preloadedAppClients, preloadedProviders, loadingAuthData }: AuthenticationSectionProps) {
  
  const [newScope, setNewScope] = useState('');
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
  const [existingAuthConfigs, setExistingAuthConfigs] = useState<AuthConfig[]>(preloadedAuthConfigs || []);
  const [loadingAuthConfigs, setLoadingAuthConfigs] = useState(false);
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

  // Track if we've already loaded auth configs to prevent repeated API calls
  const hasLoadedAuthConfigsRef = useRef(false);

  // Load existing AuthConfigs when social auth is enabled (only once or when enabled changes)
  // Skip if we have preloaded data - create-project-dialog already handles loading
  useEffect(() => {
    if (preloadedAuthConfigs && preloadedAuthConfigs.length > 0) {
      if (existingAuthConfigs.length === 0) {
        setExistingAuthConfigs(preloadedAuthConfigs);
        hasLoadedAuthConfigsRef.current = true;
      }
      return;
    }
    
    // Only load if no preloaded data and social auth is enabled
    if (config.enableSocialAuth && !hasLoadedAuthConfigsRef.current && existingAuthConfigs.length === 0) {
      loadAuthConfigs(true);
      hasLoadedAuthConfigsRef.current = true;
    } else if (!config.enableSocialAuth) {
      hasLoadedAuthConfigsRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.enableSocialAuth, preloadedAuthConfigs]);

  // Track initial enableSocialAuth, enableApiKey, and bringOwnProvider to avoid updating on mount
  // These refs are used to prevent triggering update useEffects when syncing from authConfig
  const previousEnableSocialAuthRef = useRef<boolean | undefined>(config.enableSocialAuth);
  const previousEnableApiKeyRef = useRef<boolean | undefined>(config.enableApiKey);
  const previousBringOwnProviderRef = useRef<boolean | undefined>(config.bringOwnProvider);

  // Update authConfig's enable_social_auth when enableSocialAuth changes
  useEffect(() => {
    // Only update if we have a authConfigId and we're in edit mode
    if (!isEditMode || !config.authConfigId || !project) {
      previousEnableSocialAuthRef.current = config.enableSocialAuth;
      return;
    }

    // Skip if this is the initial load (value hasn't changed)
    if (previousEnableSocialAuthRef.current === config.enableSocialAuth) {
      return;
    }

    // Update the authConfig with the new enableSocialAuth value
    const updateAuthConfigSocialAuth = async () => {
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
          enableSocialAuth: config.enableSocialAuth,
        });
        console.log('[AuthSection] ✅ Updated authConfig enable_social_auth:', config.enableSocialAuth);
        previousEnableSocialAuthRef.current = config.enableSocialAuth;
      } catch (error) {
        console.error('[AuthSection] ❌ Error updating authConfig enable_social_auth:', error);
      }
    };

    updateAuthConfigSocialAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.enableSocialAuth, config.authConfigId, isEditMode, project]);

  // Update authConfig's enable_api_key_auth when enableApiKey changes
  useEffect(() => {
    // Only update if we have a authConfigId and we're in edit mode
    if (!isEditMode || !config.authConfigId || !project) {
      previousEnableApiKeyRef.current = config.enableApiKey;
      return;
    }

    // Skip if this is the initial load (value hasn't changed)
    if (previousEnableApiKeyRef.current === config.enableApiKey) {
      return;
    }

    // Update the authConfig with the new enableApiKey value
    const updateAuthConfigApiKey = async () => {
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
          enableApiKeyAuth: config.enableApiKey,
        });
        console.log('[AuthSection] ✅ Updated authConfig enable_api_key_auth:', config.enableApiKey);
        previousEnableApiKeyRef.current = config.enableApiKey;
      } catch (error) {
        console.error('[AuthSection] ❌ Error updating authConfig enable_api_key_auth:', error);
      }
    };

    updateAuthConfigApiKey();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.enableApiKey, config.authConfigId, isEditMode, project]);

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

  // Initialize with preloaded auth configs if provided
  useEffect(() => {
    if (preloadedAuthConfigs && preloadedAuthConfigs.length > 0) {
      setExistingAuthConfigs(preloadedAuthConfigs);
    }
  }, [preloadedAuthConfigs]);

  // Initialize with preloaded auth configs - no need to load if already preloaded
  useEffect(() => {
    if (preloadedAuthConfigs && preloadedAuthConfigs.length > 0) {
      setExistingAuthConfigs(preloadedAuthConfigs);
    }
    // Don't load from API here - create-project-dialog already handles it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloadedAuthConfigs]);

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

  // Get the determined authConfigId (same logic as in EditModeManagementUI)
  const determinedAuthConfigId = useMemo(() => {
    if (!isEditMode || !project) {
      return undefined;
    }
    const projectConfig = project.config as Record<string, unknown> | undefined;
    const projectAuthConfigId = projectConfig?.auth_config_id as string | undefined;
    
    if (projectAuthConfigId) return projectAuthConfigId;
    if (config.authConfigId) return config.authConfigId;
    if (preloadedAuthConfigs && preloadedAuthConfigs.length === 1) return preloadedAuthConfigs[0].id;
    if (preloadedAppClients && Object.keys(preloadedAppClients).length === 1) {
      return Object.keys(preloadedAppClients)[0];
    }
    return undefined;
  }, [isEditMode, project, config.authConfigId, preloadedAuthConfigs, preloadedAppClients]);

  // In edit mode, populate userGroupName from project's auth config or from determined authConfigId
  useEffect(() => {
    if (!isEditMode || !project || !determinedAuthConfigId) {
      return;
    }
    
    // Find the auth config name from preloaded or existing configs
    // Priority: preloadedAuthConfigs > existingAuthConfigs
    const allPools = preloadedAuthConfigs && preloadedAuthConfigs.length > 0 
      ? preloadedAuthConfigs 
      : existingAuthConfigs;
    
    const authConfig = allPools.find(pool => pool.id === determinedAuthConfigId);
    if (authConfig) {
      // Always set userGroupName if we found the auth config and it's different or empty
      if (!config.userGroupName || config.userGroupName !== authConfig.name) {
        console.log('[AuthSection] Setting userGroupName:', authConfig.name, 'for authConfigId:', determinedAuthConfigId);
        updateConfig({ 
          userGroupName: authConfig.name,
          authConfigId: determinedAuthConfigId, // Also ensure authConfigId is set
        });
      }
    } else {
      console.log('[AuthSection] Auth config not found:', {
        determinedAuthConfigId,
        preloadedCount: preloadedAuthConfigs?.length || 0,
        existingCount: existingAuthConfigs.length,
        allPoolsCount: allPools.length,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, project, determinedAuthConfigId, config.userGroupName, preloadedAuthConfigs, existingAuthConfigs]);

  // Track which authConfigId we've already loaded data for to prevent duplicate loads
  const loadedAuthConfigIdRef = useRef<string | undefined>(undefined);
  
  // When selectedAuthConfigId changes, update config and load data - simplified to prevent loops
  // NOTE: This only runs in CREATE mode. In EDIT mode, EditModeManagementUI handles loading.
  useEffect(() => {
    // Skip entirely in edit mode - EditModeManagementUI handles it
    if (isEditMode && project) {
      return;
    }
    
    if (!selectedAuthConfigId) {
      return;
    }
    
    // Skip if we've already loaded data for this authConfigId
    if (loadedAuthConfigIdRef.current === selectedAuthConfigId) {
      return;
    }
    
    // Mark as loading
    loadedAuthConfigIdRef.current = selectedAuthConfigId;
    
    // Load authConfig details to sync toggles - check preloaded first
    const preloadedAuthConfig = preloadedAuthConfigs?.find(ac => ac.id === selectedAuthConfigId);
    if (preloadedAuthConfig) {
      console.log('[AuthSection] ✅ Using preloaded auth config for toggles (create mode)');
      updateConfig({ 
        authConfigId: selectedAuthConfigId, 
        useAuthConfig: true,
        enableSocialAuth: preloadedAuthConfig.enableSocialAuth || false,
        enableApiKey: preloadedAuthConfig.enableApiKeyAuth || false,
        bringOwnProvider: preloadedAuthConfig.bringMyOwnOAuth || false,
      });
    } else {
      console.log('[AuthSection] 📡 Loading auth config from API for toggles (create mode)');
      api.getAuthConfig(selectedAuthConfigId).then(authConfig => {
        updateConfig({ 
          authConfigId: selectedAuthConfigId, 
          useAuthConfig: true,
          enableSocialAuth: authConfig.enableSocialAuth || false,
          enableApiKey: authConfig.enableApiKeyAuth || false,
          bringOwnProvider: authConfig.bringMyOwnOAuth || false,
        });
      }).catch(() => {
        updateConfig({ authConfigId: selectedAuthConfigId, useAuthConfig: true });
      });
    }
    
    // Load AppClients (use preloaded if available)
    if (preloadedAppClients?.[selectedAuthConfigId]) {
      console.log('[AuthSection] ✅ Using preloaded app clients (create mode)');
      const clients = preloadedAppClients[selectedAuthConfigId];
      if (clients.length > 0 && !config.appClientId) {
        const defaultClient = clients.find(c => c.id === config.defaultAppClient) || clients[0];
        updateConfig({ 
          appClientId: defaultClient.id,
          defaultAppClient: config.defaultAppClient || defaultClient.id,
        });
      }
      // Load details and providers for all clients
      clients.forEach(client => {
        loadAppClientDetails(selectedAuthConfigId, client.id);
        const providerKey = `${selectedAuthConfigId}-${client.id}`;
        if (preloadedProviders?.[providerKey]) {
          const providers = preloadedProviders[providerKey];
          if (providers.length > 0 && (client.id === config.appClientId || (!config.appClientId && client === clients[0]))) {
            const provider = providers[0] as SocialProviderResponse;
            setThirdPartyProvider(provider);
            updateConfig({
              bringOwnProvider: true,
              socialProvider: (provider.type || 'github') as 'github' | 'google' | 'microsoft' | 'facebook' | 'auth0' | 'other',
              identityProviderDomain: provider.domain || '',
              identityProviderClientId: provider.client_id || provider.clientId || '',
            });
          }
        } else if (config.useAuthConfig && !config.bringOwnProvider) {
          loadThirdPartyProvider(selectedAuthConfigId, client.id);
        }
      });
    } else {
      // Load from API
      console.log('[AuthSection] 📡 Loading app clients from API (create mode)');
      api.listAppClients(selectedAuthConfigId).then(response => {
        const clients = Array.isArray(response) ? response : [];
        if (clients.length > 0 && !config.appClientId) {
          const defaultClient = clients.find(c => c.id === config.defaultAppClient) || clients[0];
          updateConfig({ 
            appClientId: defaultClient.id,
            defaultAppClient: config.defaultAppClient || defaultClient.id,
          });
        }
        // Load details and providers for all clients
        clients.forEach(client => {
          loadAppClientDetails(selectedAuthConfigId, client.id);
          const providerKey = `${selectedAuthConfigId}-${client.id}`;
          if (preloadedProviders?.[providerKey]) {
            const providers = preloadedProviders[providerKey];
            if (providers.length > 0 && (client.id === config.appClientId || (!config.appClientId && client === clients[0]))) {
              const provider = providers[0] as SocialProviderResponse;
              setThirdPartyProvider(provider);
              updateConfig({
                bringOwnProvider: true,
                socialProvider: (provider.type || 'github') as 'github' | 'google' | 'microsoft' | 'facebook' | 'auth0' | 'other',
                identityProviderDomain: provider.domain || '',
                identityProviderClientId: provider.client_id || provider.clientId || '',
              });
            }
          } else if (config.useAuthConfig && !config.bringOwnProvider) {
            loadThirdPartyProvider(selectedAuthConfigId, client.id);
          }
        });
      }).catch(error => {
        console.error('[AuthSection] ❌ Error loading app clients:', error);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAuthConfigId, isEditMode, project]);

  const loadAuthConfigs = async (showLoading = false) => {
    // Only show loading state if explicitly requested (e.g., first load)
    // For background refreshes, don't show loading to keep UI responsive
    if (showLoading) {
      setLoadingAuthConfigs(true);
    }
    try {
      console.log('[AuthSection] 📥 Fetching auth configs from API...');
      const pools = await api.listAuthConfigs();
      const poolsArray = Array.isArray(pools) ? pools : [];
      console.log('[AuthSection] ✅ Auth configs loaded:', {
        count: poolsArray.length,
        names: poolsArray.map(p => p.name),
      });
      setExistingAuthConfigs(poolsArray);
    } catch (error) {
      console.error('[AuthSection] ❌ Error loading auth configs:', error);
      // Only clear pools if this was the initial load
      if (showLoading) {
        setExistingAuthConfigs([]);
      }
    } finally {
      if (showLoading) {
        setLoadingAuthConfigs(false);
      }
    }
  };

  const loadAppClientDetails = async (authConfigId?: string, appClientId?: string) => {
    const authConfigIdToUse = authConfigId || config.authConfigId;
    const clientId = appClientId || config.appClientId;
    
    if (!authConfigIdToUse || !clientId) return;
    
    setLoadingAppClient(true);
    try {
      const client = await api.getAppClient(authConfigIdToUse, clientId);
      setAppClientDetails(client);
    } catch (error) {
      console.error('Error loading app client details:', error);
      setAppClientDetails(null);
    } finally {
      setLoadingAppClient(false);
    }
  };

  const loadThirdPartyProvider = async (authConfigId?: string, appClientId?: string) => {
    const authConfigIdToUse = authConfigId || config.authConfigId;
    const clientId = appClientId || config.appClientId;
    
    if (!authConfigIdToUse || !clientId) return;
    
    setLoadingProvider(true);
    try {
      const providers = await api.listProviders(authConfigIdToUse, clientId);
      // Get the first provider (usually there's one per app client)
      if (providers && providers.length > 0) {
        const provider = providers[0];
        setThirdPartyProvider(provider);
        // Update config with provider info
        // Update config with third-party provider details
        // This ensures the "Bring My Own OAuth Provider" section is shown
        updateConfig({
          bringOwnProvider: true,
          socialProvider: (provider.type || 'github') as 'github' | 'google' | 'microsoft' | 'facebook' | 'auth0' | 'other',
          identityProviderDomain: provider.domain || '',
          identityProviderClientId: provider.client_id || provider.clientId || '',
          // Note: client secret is not returned for security reasons
        });
      } else {
        setThirdPartyProvider(null);
        // No provider configured - using default APIBlaze GitHub
        updateConfig({
          bringOwnProvider: false,
        });
      }
    } catch (error) {
      console.error('Error loading third-party provider:', error);
      setThirdPartyProvider(null);
    } finally {
      setLoadingProvider(false);
    }
  };

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
    updateConfig({
      useAuthConfig: true,
      authConfigId: appClient.authConfigId,
      appClientId: appClient.id,
      // Clear bringOwnProvider when using existing AuthConfig
      bringOwnProvider: false,
      identityProviderClientId: '',
      identityProviderClientSecret: '',
      identityProviderDomain: '',
    });
    setAuthConfigModalOpen(false); 
  };

  return (
    <div className="space-y-6">
      {/* Auth Config Name */}
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
              loadingAuthConfigs || (loadingAuthData && !config.userGroupName)
                ? "Loading..."
                : "Enter a unique name (e.g., my-api-users)"
            }
            value={config.userGroupName}
            onChange={(e) => updateConfig({ userGroupName: e.target.value })}
            className="pr-10"
            disabled={loadingAuthData && !config.userGroupName}
          />
          {loadingAuthConfigs || (loadingAuthData && !config.userGroupName) ? (
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
                      updateConfig({ userGroupName: pool.name });
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

      {/* Authentication Methods */}
      <div className="space-y-4">
        <div>
          <Label className="text-base font-semibold">Authentication Methods</Label>
          <p className="text-sm text-muted-foreground">
            Choose how end users will authenticate to access your API
          </p>
        </div>

        {/* API Key Authentication */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="space-y-1">
            <Label htmlFor="enableApiKey" className="text-sm font-medium">
              Enable API Key Authentication
            </Label>
            <p className="text-xs text-muted-foreground">
              Users will authenticate using API keys. Portal helps users create them.
            </p>
          </div>
          <Switch
            id="enableApiKey"
            checked={config.enableApiKey}
            onCheckedChange={(checked) => updateConfig({ enableApiKey: checked })}
          />
        </div>

        {/* Social Authentication */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="space-y-1">
            <Label htmlFor="enableSocialAuth" className="text-sm font-medium">
              Enable Social Authentication
            </Label>
            <p className="text-xs text-muted-foreground">
              Users will authenticate using OAuth tokens (GitHub default)
            </p>
          </div>
          <Switch
            id="enableSocialAuth"
            checked={config.enableSocialAuth}
            onCheckedChange={(checked) => updateConfig({ enableSocialAuth: checked })}
          />
        </div>

        {/* OAuth Provider Configuration */}
        {/* In edit mode, always show EditModeManagementUI if we have a project (to load auth config data) */}
        {/* In create mode, only show if enableSocialAuth is true */}
        {((isEditMode && project) || config.enableSocialAuth) && (
          <div className="space-y-4 pl-4 border-l-2 border-blue-200">
            {/* Edit Mode: Show AuthConfig/AppClient/Provider Management UI */}
            {isEditMode ? (
              <EditModeManagementUI
                config={config}
                updateConfig={updateConfig}
                project={project}
                onProjectUpdate={onProjectUpdate}
                initialAuthConfigId={project?.config ? (project.config as Record<string, unknown>).auth_config_id as string | undefined : config.authConfigId}
                preloadedAuthConfigs={preloadedAuthConfigs}
                preloadedAppClients={preloadedAppClients}
                preloadedProviders={preloadedProviders}
                loadingAuthData={loadingAuthData}
              />
            ) : (
              /* Create Mode: Show AuthConfig data if selected AND social auth enabled, otherwise show third-party provider config */
              <div className="space-y-4">
                {/* Show AuthConfig/AppClient/Provider info when useAuthConfig is true AND social auth is enabled */}
                {config.useAuthConfig && config.authConfigId && config.enableSocialAuth ? (
                  <EditModeManagementUI
                    config={config}
                    updateConfig={updateConfig}
                    project={project}
                    onProjectUpdate={onProjectUpdate}
                    preloadedAuthConfigs={preloadedAuthConfigs}
                    preloadedAppClients={preloadedAppClients}
                    preloadedProviders={preloadedProviders}
                    loadingAuthData={loadingAuthData}
                  />
                ) : (
                  <>
                    {/* Bring Your Own Provider Toggle */}
                    <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                      <div className="space-y-1">
                        <Label htmlFor="bringOwnProvider" className="text-sm font-medium">
                          Bring My Own OAuth Provider
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Use your own Google, Auth0, or other OAuth provider 
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Leave off to use default APIBlaze GitHub
                        </p>
                      </div>
                      <Switch
                        id="bringOwnProvider"
                        checked={config.bringOwnProvider}
                        onCheckedChange={(checked) => updateConfig({ bringOwnProvider: checked })}
                      />
                    </div>

                {/* Provider Configuration - Two Column Layout */}
                {config.bringOwnProvider && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left Column - Configuration Fields */}
                    <div className="space-y-4">
                      {/* Provider Selection */}
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

                      {/* Provider Details */}
                      <div>
                        <Label htmlFor="identityProviderDomain" className="text-sm">
                          Identity Provider Domain
                        </Label>
                        <Input
                          id="identityProviderDomain"
                          placeholder="https://accounts.google.com"
                          value={config.identityProviderDomain}
                          onChange={(e) => updateConfig({ identityProviderDomain: e.target.value })}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label htmlFor="identityProviderClientId" className="text-sm">
                          Client ID
                        </Label>
                        <Input
                          id="identityProviderClientId"
                          placeholder="your-client-id"
                          value={config.identityProviderClientId}
                          onChange={(e) => updateConfig({ identityProviderClientId: e.target.value })}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label htmlFor="identityProviderClientSecret" className="text-sm">
                          Client Secret
                        </Label>
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
                        <Label htmlFor="tokenType" className="text-sm">Token Type</Label>
                        <Select
                          value={config.tokenType || 'thirdParty'}
                          onValueChange={(value) => updateConfig({ tokenType: value as 'apiblaze' | 'thirdParty' })}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue>
                              {config.tokenType === 'apiblaze' 
                                ? 'APIBlaze' 
                                : `${config.socialProvider.charAt(0).toUpperCase() + config.socialProvider.slice(1)} token`}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="apiblaze">APIBlaze</SelectItem>
                            <SelectItem value="thirdParty">
                              {config.socialProvider.charAt(0).toUpperCase() + config.socialProvider.slice(1)} token
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Authorized Scopes */}
                      <div>
                        <Label className="text-sm">Authorized Scopes</Label>
                        <p className="text-xs text-muted-foreground mb-2">
                          Default mandatory scopes: email, openid, profile
                        </p>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {config.authorizedScopes.map((scope) => (
                            <Badge key={scope} variant="secondary" className="text-xs">
                              {scope}
                              {!['email', 'openid', 'profile'].includes(scope) && (
                                <X
                                  className="ml-1 h-3 w-3 cursor-pointer"
                                  onClick={() => removeScope(scope)}
                                />
                              )}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Add custom scope"
                            value={newScope}
                            onChange={(e) => setNewScope(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addScope();
                              }
                            }}
                          />
                          <Button type="button" size="sm" onClick={addScope}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>

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
                            {config.socialProvider.charAt(0).toUpperCase() + config.socialProvider.slice(1)} Setup Guide
                          </CardTitle>
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

                    {/* Authorized Callback URLs - Moved after Bring My Own OAuth Provider section */}
                    <div className="space-y-2">
                      <Label className="text-sm">Authorized Callback URLs</Label>
                      <div className="flex gap-2 mb-2 mt-2">
                        <Input
                          value={newAuthorizedCallbackUrl}
                          onChange={(e) => setNewAuthorizedCallbackUrl(e.target.value)}
                          placeholder="https://example.com/callback"
                          className="text-xs"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const url = newAuthorizedCallbackUrl.trim();
                              if (url && !authorizedCallbackUrls.includes(url)) {
                                try {
                                  const urlObj = new URL(url);
                                  if (urlObj.protocol !== 'https:') {
                                    alert('URL must use HTTPS protocol');
                                    return;
                                  }
                                  updateAuthorizedCallbackUrls([...authorizedCallbackUrls, url]);
                                  setNewAuthorizedCallbackUrl('');
                                } catch {
                                  alert('Invalid URL format');
                                }
                              }
                            }
                          }}
                        />
                        <Button 
                          type="button" 
                          size="sm" 
                          onClick={() => {
                            const url = newAuthorizedCallbackUrl.trim();
                            if (!url) return;
                            if (authorizedCallbackUrls.includes(url)) {
                              alert('This URL is already in the list');
                              return;
                            }
                            try {
                              const urlObj = new URL(url);
                              if (urlObj.protocol !== 'https:') {
                                alert('URL must use HTTPS protocol');
                                return;
                              }
                              updateAuthorizedCallbackUrls([...authorizedCallbackUrls, url]);
                              setNewAuthorizedCallbackUrl('');
                            } catch {
                              alert('Invalid URL format');
                            }
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-4">
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
                              onClick={() => updateAuthorizedCallbackUrls(authorizedCallbackUrls.filter((u) => u !== url))}
                            >
                              <X className="h-2 w-2" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <AuthConfigModal
        open={authConfigModalOpen}
        onOpenChange={setAuthConfigModalOpen}
        mode="select"
        onSelect={handleUseExistingAuthConfig}
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
                      updateConfig({ userGroupName: pool.name });
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
