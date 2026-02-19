'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Loader2, Rocket, ChevronRight, Save } from 'lucide-react';
import { GeneralSection } from './general-section';
import { AuthenticationSection } from './authentication-section';
import { TargetServersSection } from './target-servers-section';
import { ThrottlingSection } from './throttling-section';
import { RoutesSection } from './routes-section';
import { PrePostProcessingSection } from './preprocessing-section';
import { DomainsSection } from './domains-section';
import { ProjectConfig, type SocialProvider } from './types';
import type { RouteEntry } from './types';
import { api } from '@/lib/api';
import { getDefaultTargetServers } from './default-environments';
import type { TargetServer } from './types';
import { useToast } from '@/hooks/use-toast';
import { deleteProject, updateProjectConfig } from '@/lib/api/projects';
import type { Project } from '@/types/project';
import type { ProjectConfigTab } from '@/components/dashboard-shell';
import { cn } from '@/lib/utils';

const NEW_PROJECT_STEPS: { id: ProjectConfigTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'auth', label: 'Auth' },
  { id: 'targets', label: 'Targets' },
  { id: 'throttling', label: 'Throttling' },
  { id: 'preprocessing', label: 'Processing' },
  { id: 'domains', label: 'Domains' },
];
import { useDashboardCacheStore } from '@/store/dashboard-cache';

type ProjectCreationDetails = {
  message?: string;
  format?: string;
  line?: number;
  column?: number;
  snippet?: string;
};

type ProjectCreationErrorShape = {
  message?: string;
  details?: unknown;
  suggestions?: unknown;
};

function isProjectCreationError(value: unknown): value is ProjectCreationErrorShape {
  return typeof value === 'object' && value !== null;
}

function isProjectCreationDetails(value: unknown): value is ProjectCreationDetails {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    ('message' in record ? typeof record.message === 'string' : true) &&
    ('format' in record ? typeof record.format === 'string' : true) &&
    ('line' in record ? typeof record.line === 'number' : true) &&
    ('column' in record ? typeof record.column === 'number' : true) &&
    ('snippet' in record ? typeof record.snippet === 'string' : true)
  );
}

function extractProjectCreationContext(error: unknown) {
  const fallbackMessage = error instanceof Error ? error.message.split('\n')[0] : 'Unknown error occurred';
  if (!isProjectCreationError(error)) {
    return {
      message: fallbackMessage,
      details: undefined as ProjectCreationDetails | undefined,
      suggestions: undefined as string[] | undefined,
    };
  }
  const details = isProjectCreationDetails(error.details) ? error.details : undefined;
  const suggestions = Array.isArray(error.suggestions)
    ? error.suggestions.filter((item): item is string => typeof item === 'string')
    : undefined;
  const message = typeof error.message === 'string' && error.message.length > 0 ? error.message : fallbackMessage;
  return { message, details, suggestions };
}

function getInitialConfig(project: Project | null): ProjectConfig {
  if (!project) {
    return {
      projectName: '',
      apiVersion: '1.0.0',
      sourceType: 'github',
      githubUser: '',
      githubRepo: '',
      githubPath: '',
      githubBranch: 'main',
      targetUrl: '',
      uploadedFile: null,
      userGroupName: '',
      enableSocialAuth: true,
      requestsAuthMode: 'authenticate' as const,
      requestsAuthMethods: ['jwt', 'api_key'] as ('jwt' | 'opaque' | 'api_key')[],
      allowedIssuers: [],
      allowedAudiences: [],
      opaqueTokenEndpoint: '',
      opaqueTokenMethod: 'GET' as const,
      opaqueTokenParams: '?access_token={token}',
      opaqueTokenBody: 'token={token}',
      useAuthConfig: false,
      authConfigId: undefined,
      appClientId: undefined,
      defaultAppClient: undefined,
      bringOwnProvider: false,
      socialProvider: 'google',
      identityProviderDomain: 'https://accounts.google.com',
      identityProviderClientId: '',
      identityProviderClientSecret: '',
      scopes: ['email', 'openid', 'profile'], // Google defaults; switching provider in Auth section updates to that provider's defaults
      tokenType: 'apiblaze',
      targetServerToken: 'apiblaze',
      includeApiblazeAccessTokenHeader: false,
      includeApiblazeIdTokenHeader: false,
      whoCanRegisterToLogin: 'anyone',
      targetServers: getDefaultTargetServers(),
      createPortal: true,
      portalLogoUrl: '',
      throttling: { userRateLimit: 10, proxyDailyQuota: 1000, accountMonthlyQuota: 30000 },
      preProcessingPath: '',
      postProcessingPath: '',
      customDomains: [],
    };
  }
  const projectConfig = project?.config as Record<string, unknown> | undefined;
  const specSource = project?.spec_source;
  if (!specSource) return getInitialConfig(null);
  return {
    projectName: project?.display_name || '',
    apiVersion: project?.api_version || '1.0.0',
    sourceType: specSource.type === 'github' ? 'github' : specSource.type === 'upload' ? 'upload' : 'targetUrl',
    githubUser: specSource.github?.owner || '',
    githubRepo: specSource.github?.repo || '',
    githubPath: (projectConfig?.github_source as Record<string, unknown>)?.path as string || (specSource.github as Record<string, unknown>)?.path as string || '',
    githubBranch: specSource.github?.branch || 'main',
    targetUrl: (projectConfig?.target_url as string) || (projectConfig?.target as string) || '',
    uploadedFile: null,
    userGroupName: (projectConfig?.auth_config_name as string) || '',
    enableSocialAuth: true,
    requestsAuthMode: ((projectConfig?.requests_auth as Record<string, unknown>)?.mode as 'authenticate' | 'passthrough') || 'passthrough',
    requestsAuthMethods: ((projectConfig?.requests_auth as Record<string, unknown>)?.methods as ('jwt' | 'opaque' | 'api_key')[]) || ['jwt'],
    allowedIssuers: ((projectConfig?.requests_auth as Record<string, unknown>)?.jwt as Record<string, unknown>)?.allowed_issuers as string[] || [],
    allowedAudiences: ((projectConfig?.requests_auth as Record<string, unknown>)?.jwt as Record<string, unknown>)?.allowed_audiences as string[] || [],
    opaqueTokenEndpoint: ((projectConfig?.requests_auth as Record<string, unknown>)?.opaque as Record<string, unknown>)?.endpoint as string || '',
    opaqueTokenMethod: ((projectConfig?.requests_auth as Record<string, unknown>)?.opaque as Record<string, unknown>)?.method as 'GET' | 'POST' || 'GET',
    opaqueTokenParams: ((projectConfig?.requests_auth as Record<string, unknown>)?.opaque as Record<string, unknown>)?.params as string || '?access_token={token}',
    opaqueTokenBody: ((projectConfig?.requests_auth as Record<string, unknown>)?.opaque as Record<string, unknown>)?.body as string || 'token={token}',
    useAuthConfig: !!(projectConfig?.auth_config_id as string),
    authConfigId: projectConfig?.auth_config_id as string | undefined,
    appClientId: undefined,
    defaultAppClient: (projectConfig?.default_app_client_id || projectConfig?.defaultAppClient) as string | undefined,
    bringOwnProvider: !!(projectConfig?.oauth_config as Record<string, unknown>),
    socialProvider: (((projectConfig?.oauth_config as Record<string, unknown>)?.provider as string) || 'google') as SocialProvider,
    identityProviderDomain: (projectConfig?.oauth_config as Record<string, unknown>)?.domain as string || 'https://accounts.google.com',
    identityProviderClientId: (projectConfig?.oauth_config as Record<string, unknown>)?.client_id as string || '',
    identityProviderClientSecret: '',
    scopes: (Array.isArray((projectConfig?.oauth_config as Record<string, unknown>)?.scopes)
      ? (projectConfig?.oauth_config as Record<string, unknown>)?.scopes as string[]
      : ((projectConfig?.oauth_config as Record<string, unknown>)?.scopes as string)?.split(' ')) || ['email', 'openid', 'profile'],
    tokenType: ((projectConfig?.oauth_config as Record<string, unknown>)?.token_type as 'apiblaze' | 'thirdParty') || 'apiblaze',
    targetServerToken: ((projectConfig?.oauth_config as Record<string, unknown>)?.target_server_token as 'apiblaze' | 'third_party_access_token' | 'third_party_id_token' | 'none') || 'apiblaze',
    includeApiblazeAccessTokenHeader: !!((projectConfig?.oauth_config as Record<string, unknown>)?.include_apiblaze_access_token_header) || !!((projectConfig?.oauth_config as Record<string, unknown>)?.include_apiblaze_token_header),
    includeApiblazeIdTokenHeader: !!((projectConfig?.oauth_config as Record<string, unknown>)?.include_apiblaze_id_token_header),
    whoCanRegisterToLogin: ((projectConfig?.auth_config as Record<string, unknown>)?.who_can_register === 'authorized_only' ? 'authorized_only' : 'anyone') as 'anyone' | 'authorized_only',
    targetServers: (() => {
      const targetUrl = (projectConfig?.target_url as string) || (projectConfig?.target as string) || '';
      const envs = projectConfig?.environments as Record<string, { target?: string }> | undefined;
      if (envs && Object.keys(envs).length > 0) {
        return Object.entries(envs).map(([stage, env]) => ({
          stage,
          targetUrl: env.target || targetUrl,
          config: [],
        })) as TargetServer[];
      }
      return getDefaultTargetServers(targetUrl);
    })(),
    createPortal: true,
    portalLogoUrl: '',
    throttling: (() => {
      if (projectConfig?.throttling && typeof projectConfig.throttling === 'object') {
        const t = projectConfig.throttling as { userRateLimit?: number; proxyDailyQuota?: number; accountMonthlyQuota?: number };
        return { userRateLimit: t.userRateLimit ?? 10, proxyDailyQuota: t.proxyDailyQuota ?? 1000, accountMonthlyQuota: t.accountMonthlyQuota ?? 30000 };
      }
      return { userRateLimit: 10, proxyDailyQuota: 1000, accountMonthlyQuota: 30000 };
    })(),
    preProcessingPath: '',
    postProcessingPath: '',
    customDomains: [],
  };
}

interface ProjectConfigPanelProps {
  project: Project | null;
  preloadedGitHubRepos: Array<{ id: number; name: string; full_name: string; description: string; default_branch: string; updated_at: string; language: string; stargazers_count: number }>;
  onDeploySuccess?: () => void;
  onProjectUpdate?: (updatedProject: Project) => void;
  /** Called when user cancels - navigates back to projects list */
  onCancel?: () => void;
  /** When provided, submenu is rendered by parent (DashboardShell); panel only renders content */
  activeTab?: ProjectConfigTab;
  onTabChange?: (tab: ProjectConfigTab) => void;
}

export function ProjectConfigPanel({
  project,
  preloadedGitHubRepos,
  onDeploySuccess,
  onProjectUpdate,
  onCancel,
  activeTab: activeTabProp,
  onTabChange: onTabChangeProp,
}: ProjectConfigPanelProps) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [internalActiveTab, setInternalActiveTab] = useState<ProjectConfigTab>('general');
  const activeTab = activeTabProp ?? internalActiveTab;
  const setActiveTab = onTabChangeProp ?? setInternalActiveTab;
  const [isDeploying, setIsDeploying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [currentProject, setCurrentProject] = useState<Project | null>(project);
  const isDeployingRef = useRef(false);
  const routesRef = useRef<RouteEntry[]>([]);
  const [projectNameCheckBlockDeploy, setProjectNameCheckBlockDeploy] = useState(false);
  const getAppClients = useDashboardCacheStore((s) => s.getAppClients);

  useEffect(() => {
    setCurrentProject(project);
  }, [project]);

  const [config, setConfig] = useState<ProjectConfig>(() => getInitialConfig(project));

  useEffect(() => {
    if (!isDeployingRef.current) {
      setConfig(getInitialConfig(currentProject));
    }
  }, [currentProject]);

  const updateConfig = useCallback((updates: Partial<ProjectConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  const isSourceConfigured = () => {
    if (!config.projectName) return false;
    switch (config.sourceType) {
      case 'github':
        return !!(config.githubUser && config.githubRepo && config.githubPath);
      case 'targetUrl':
        return !!config.targetUrl;
      case 'upload':
        return !!config.uploadedFile;
      default:
        return false;
    }
  };

  const getValidationError = (): 'project-name' | 'github-source' | 'target-url' | 'upload-file' | null => {
    switch (config.sourceType) {
      case 'github':
        if (!config.githubUser || !config.githubRepo || !config.githubPath) return 'github-source';
        break;
      case 'targetUrl':
        if (!config.targetUrl) return 'target-url';
        break;
      case 'upload':
        if (!config.uploadedFile) return 'upload-file';
        break;
    }
    if (!config.projectName) return 'project-name';
    return null;
  };

  const validationError = getValidationError();
  const teamId = session?.user?.id ? `team_${(session.user as { id?: string }).id}` : undefined;

  const handleDeploy = async () => {
    setIsDeploying(true);
    isDeployingRef.current = true;
    let rollbackAuthConfigId: string | undefined;
    let rollbackAppClient: { authConfigId: string; appClientId: string } | undefined;

    try {
      if (!config.projectName) {
        toast({ title: 'Validation Error', description: 'Project name is required', variant: 'destructive' });
        setActiveTab('general');
        setIsDeploying(false);
        return;
      }

      const subdomain = config.projectName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const apiVersion = config.apiVersion || '1.0.0';

      if (currentProject) {
        try {
          await deleteProject(currentProject.project_id, currentProject.api_version);
        } catch (deleteError) {
          toast({
            title: 'Deployment Failed',
            description: `Failed to delete existing project: ${deleteError instanceof Error ? deleteError.message : 'Unknown error'}`,
            variant: 'destructive',
          });
          setIsDeploying(false);
          return;
        }
      } else {
        try {
          const checkResult = await api.checkProjectExists(config.projectName, subdomain, apiVersion);
          if (checkResult.exists) {
            toast({
              title: 'Project Already Exists',
              description: `A project with the name "${config.projectName}" and version "${apiVersion}" already exists.`,
              variant: 'destructive',
            });
            setActiveTab('general');
            setIsDeploying(false);
            return;
          }
        } catch {
          // Continue
        }
      }

      let authConfigId: string | undefined;
      let appClientId: string | undefined;
      let oauthConfig: unknown;
      let defaultAppClientId: string | undefined = config.defaultAppClient;

      const githubSource = config.sourceType === 'github' && config.githubUser && config.githubRepo && config.githubPath
        ? { owner: config.githubUser, repo: config.githubRepo, path: config.githubPath, branch: config.githubBranch || 'main' }
        : undefined;

      const environments: Record<string, { target: string }> = {};
      config.targetServers.forEach((server) => {
        if (server.targetUrl) environments[server.stage] = { target: server.targetUrl };
      });

      const authType = config.enableSocialAuth ? 'oauth' : 'none';
      const needsAuthConfig = config.enableSocialAuth || authType === 'oauth';

      if (needsAuthConfig) {
        const hasExistingAuthConfig = config.useAuthConfig && config.authConfigId;
        if (hasExistingAuthConfig) {
          const selectedAuthConfigId = config.authConfigId!;
          let selectedAppClientId = config.appClientId || config.defaultAppClient;
          if (!selectedAppClientId && selectedAuthConfigId) {
            const clientsArray = getAppClients(selectedAuthConfigId);
            if (clientsArray.length === 0) {
              toast({
                title: 'Configuration Error',
                description: 'The selected auth config has no app clients.',
                variant: 'destructive',
              });
              setActiveTab('auth');
              setIsDeploying(false);
              return;
            }
            selectedAppClientId = clientsArray[0].id;
            defaultAppClientId = clientsArray[0].id;
            updateConfig({ defaultAppClient: defaultAppClientId });
          } else {
            defaultAppClientId = selectedAppClientId ?? config.defaultAppClient;
          }
          authConfigId = selectedAuthConfigId;
          appClientId = selectedAppClientId ?? undefined;
          oauthConfig = undefined;
        } else if (config.bringOwnProvider) {
          const hasProviders = config.providers && config.providers.length > 0;
          const hasLegacyProvider = config.identityProviderClientId && config.identityProviderClientSecret;
          if (!hasProviders && !hasLegacyProvider) {
            toast({
              title: 'Validation Error',
              description: 'Please add at least one OAuth provider with Client ID and Client Secret',
              variant: 'destructive',
            });
            setActiveTab('auth');
            setIsDeploying(false);
            return;
          }
          try {
            const authConfigName = config.userGroupName || `${config.projectName}-authconfig`;
            const existingAuthConfigs = await api.listAuthConfigs();
            const existingAuthConfig = Array.isArray(existingAuthConfigs)
              ? existingAuthConfigs.find((p: { name: string; id: string }) => p.name === authConfigName)
              : null;
            let currentAuthConfigId: string;
            if (existingAuthConfig) {
              currentAuthConfigId = existingAuthConfig.id;
            } else {
              const authConfig = await api.createAuthConfig({
                name: authConfigName,
                enableSocialAuth: config.enableSocialAuth,
                enableApiKeyAuth: config.requestsAuthMethods?.includes('api_key'),
                bringMyOwnOAuth: config.bringOwnProvider,
              });
              currentAuthConfigId = (authConfig as { id: string }).id;
              rollbackAuthConfigId = currentAuthConfigId;
            }
            const defaultCallbackUrl = `https://${config.projectName}.portal.apiblaze.com/${config.apiVersion || '1.0.0'}`;
            const callbackUrls = config.authorizedCallbackUrls?.length ? config.authorizedCallbackUrls : [defaultCallbackUrl];
            const finalCallbackUrls = callbackUrls.includes(defaultCallbackUrl)
              ? [defaultCallbackUrl, ...callbackUrls.filter((u) => u !== defaultCallbackUrl)]
              : [defaultCallbackUrl, ...callbackUrls];
            const appClient = await api.createAppClient(currentAuthConfigId, {
              name: `${config.projectName}-appclient`,
              scopes: config.scopes,
              authorizedCallbackUrls: finalCallbackUrls,
              projectName: config.projectName,
              apiVersion: config.apiVersion || '1.0.0',
            });
            const newAppClientId = (appClient as { id: string }).id;
            if (!rollbackAuthConfigId) rollbackAppClient = { authConfigId: currentAuthConfigId, appClientId: newAppClientId };
            const DEFAULT_SCOPES: Record<SocialProvider, string[]> = {
              google: ['email', 'openid', 'profile'],
              github: ['read:user', 'user:email'],
              microsoft: ['email', 'openid', 'profile'],
              facebook: ['email', 'public_profile'],
              auth0: ['openid', 'profile', 'email'],
              other: ['openid', 'profile'],
            };
            const providersToAdd = config.providers?.length
              ? config.providers
              : config.identityProviderClientId && config.identityProviderClientSecret
                ? [{
                    type: config.socialProvider,
                    clientId: config.identityProviderClientId,
                    clientSecret: config.identityProviderClientSecret,
                    domain: config.identityProviderDomain || undefined,
                    tokenType: config.tokenType || 'apiblaze',
                    targetServerToken: config.targetServerToken || 'apiblaze',
                    includeApiblazeAccessTokenHeader: config.includeApiblazeAccessTokenHeader ?? false,
                    includeApiblazeIdTokenHeader: config.includeApiblazeIdTokenHeader ?? false,
                    scopes: config.scopes?.length ? config.scopes : DEFAULT_SCOPES[config.socialProvider],
                  }]
                : [];
            for (const provider of providersToAdd) {
              const providerScopes = provider.scopes?.length ? provider.scopes : DEFAULT_SCOPES[provider.type];
              await api.addProvider(currentAuthConfigId, newAppClientId, {
                type: provider.type,
                clientId: provider.clientId,
                clientSecret: provider.clientSecret,
                scopes: providerScopes,
                domain: provider.domain,
                tokenType: ((provider as { tokenType?: string }).tokenType || config.tokenType || 'apiblaze') as 'apiblaze' | 'thirdParty',
                targetServerToken: ((provider as { targetServerToken?: string }).targetServerToken || config.targetServerToken || 'apiblaze') as 'apiblaze' | 'third_party_access_token' | 'third_party_id_token' | 'none',
                includeApiblazeAccessTokenHeader: (provider as { includeApiblazeAccessTokenHeader?: boolean }).includeApiblazeAccessTokenHeader ?? config.includeApiblazeAccessTokenHeader ?? false,
                includeApiblazeIdTokenHeader: (provider as { includeApiblazeIdTokenHeader?: boolean }).includeApiblazeIdTokenHeader ?? config.includeApiblazeIdTokenHeader ?? false,
              });
            }
            authConfigId = currentAuthConfigId;
            appClientId = newAppClientId;
            oauthConfig = undefined;
            defaultAppClientId = newAppClientId;
            updateConfig({ defaultAppClient: defaultAppClientId });
          } catch (error) {
            console.error('Error creating AuthConfig:', error);
            toast({ title: 'Error Creating AuthConfig', description: 'Failed to create AuthConfig automatically.', variant: 'destructive' });
            setIsDeploying(false);
            return;
          }
        } else {
          try {
            const authConfigName = config.userGroupName || `${config.projectName}-authconfig`;
            const appClientName = `${config.projectName}-appclient`;
            const result = await api.createAuthConfigWithDefaultGitHub({
              authConfigName,
              appClientName,
              scopes: config.scopes,
              enableSocialAuth: config.enableSocialAuth,
              enableApiKeyAuth: config.requestsAuthMethods?.includes('api_key'),
              bringMyOwnOAuth: config.bringOwnProvider,
              projectName: config.projectName,
              apiVersion: config.apiVersion || '1.0.0',
            });
            rollbackAuthConfigId = result.authConfigId;
            authConfigId = result.authConfigId;
            appClientId = result.appClientId;
            oauthConfig = undefined;
            defaultAppClientId = result.appClientId;
            updateConfig({ defaultAppClient: defaultAppClientId });
          } catch (error) {
            console.error('Error creating AuthConfig for GitHub:', error);
            const msg = error instanceof Error ? error.message : 'Unknown error';
            toast({
              title: 'Error Creating AuthConfig',
              description: msg.includes('not configured') ? 'Default GitHub OAuth credentials are not configured.' : msg,
              variant: 'destructive',
            });
            setIsDeploying(false);
            return;
          }
        }
      }

      if (authType === 'oauth' && !authConfigId) {
        toast({ title: 'Configuration Error', description: 'OAuth authentication requires a AuthConfig.', variant: 'destructive' });
        setIsDeploying(false);
        return;
      }

      if (appClientId && !defaultAppClientId) defaultAppClientId = appClientId;

      const requestsAuthMode = config.requestsAuthMode ?? 'passthrough';
      const requestsAuthMethods = config.requestsAuthMethods ?? ['jwt'];
      const projectNameVal = config.projectName || '';
      const apiVersionVal = config.apiVersion || '1.0.0';
      const appClientIdVal = defaultAppClientId || appClientId || '';
      const substitutePlaceholders = (s: string) =>
        s.replace(/\{projectName\}/g, projectNameVal).replace(/\{apiVersion\}/g, apiVersionVal).replace(/\{appClientId\}/g, appClientIdVal);

      let requests_auth: {
        mode: 'authenticate' | 'passthrough';
        methods?: ('jwt' | 'opaque' | 'api_key')[];
        jwt?: { allowed_issuers: string[]; allowed_audiences: string[] };
        opaque?: { endpoint: string; method: 'GET' | 'POST'; params: string; body: string };
      } | undefined;
      if (requestsAuthMode === 'passthrough') {
        requests_auth = { mode: 'passthrough', methods: [] };
      } else {
        const jwtIssuers = (config.allowedIssuers ?? []).length > 0 ? config.allowedIssuers!.map(substitutePlaceholders) : (appClientIdVal ? [`https://auth.apiblaze.com/${appClientIdVal}`] : []);
        const jwtAudiences = (config.allowedAudiences ?? []).length > 0 ? config.allowedAudiences!.map(substitutePlaceholders) : [...(projectNameVal ? [`https://${projectNameVal}.portal.apiblaze.com/${apiVersionVal}`] : []), ...(appClientIdVal ? [appClientIdVal] : [])];
        requests_auth = {
          mode: 'authenticate',
          methods: requestsAuthMethods,
          jwt: { allowed_issuers: jwtIssuers, allowed_audiences: jwtAudiences },
          opaque: requestsAuthMethods.includes('opaque') && config.opaqueTokenEndpoint
            ? { endpoint: config.opaqueTokenEndpoint, method: config.opaqueTokenMethod ?? 'GET', params: config.opaqueTokenParams ?? '?access_token={token}', body: config.opaqueTokenBody ?? 'token={token}' }
            : undefined,
        };
      }

      const projectData = {
        name: config.projectName,
        display_name: config.projectName,
        subdomain,
        target_url: config.targetUrl || config.targetServers.find((s) => s.targetUrl)?.targetUrl,
        github: githubSource,
        auth_type: authType,
        oauth_config: oauthConfig as { provider_type: string; client_id: string; client_secret: string; scopes: string } | undefined,
        auth_config_id: authConfigId,
        auth_config: { who_can_register: config.whoCanRegisterToLogin ?? 'anyone' },
        app_client_id: appClientId,
        default_app_client_id: defaultAppClientId,
        environments: Object.keys(environments).length > 0 ? environments : undefined,
        throttling: config.throttling || { userRateLimit: 10, proxyDailyQuota: 1000, accountMonthlyQuota: 30000 },
        requests_auth,
      };

      await api.createProject(projectData);

      const routesToPersist = routesRef.current?.length ? routesRef.current : (config.routeConfig?.routes ?? []);
      if (routesToPersist.length > 0 && config.projectName && config.apiVersion) {
        const { putRouteConfig } = await import('@/lib/api/route-configs');
        await putRouteConfig(config.projectName, config.apiVersion, routesToPersist);
      }
      const isUpdate = !!currentProject;
      toast({ title: isUpdate ? 'Project Updated!' : 'Project Created!', description: `${config.projectName} has been successfully ${isUpdate ? 'updated' : 'deployed'}.` });
      setCurrentProject(null);
      isDeployingRef.current = false;
      onDeploySuccess?.();
    } catch (error) {
      console.error('Failed to create project:', error);
      if (rollbackAuthConfigId || rollbackAppClient) {
        try {
          if (rollbackAppClient) await api.deleteAppClient(rollbackAppClient.authConfigId, rollbackAppClient.appClientId);
          if (rollbackAuthConfigId) await api.deleteAuthConfig(rollbackAuthConfigId);
        } catch (e) {
          console.error('Rollback failed:', e);
        }
      }
      const { message, details, suggestions } = extractProjectCreationContext(error);
      toast({
        title: 'Deployment Failed',
        description: (
          <div className="space-y-3">
            <p className="font-medium">{details?.message ?? message}</p>
            {details?.snippet && <pre className="bg-muted text-sm rounded-md p-3 overflow-x-auto whitespace-pre-wrap">{details.snippet}</pre>}
            {suggestions?.length ? <ul className="list-disc pl-5 text-sm">{suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul> : null}
          </div>
        ),
        variant: 'destructive',
      });
    } finally {
      setIsDeploying(false);
      isDeployingRef.current = false;
    }
  };

  const handleSaveConfig = useCallback(async () => {
    if (!currentProject) return;
    setIsSavingConfig(true);
    try {
      const projectNameVal = config.projectName || '';
      const apiVersionVal = config.apiVersion || '1.0.0';
      const appClientIdVal = config.defaultAppClient || (currentProject.config as Record<string, unknown>)?.default_app_client_id as string || '';
      const substitutePlaceholders = (s: string) =>
        s.replace(/\{projectName\}/g, projectNameVal).replace(/\{apiVersion\}/g, apiVersionVal).replace(/\{appClientId\}/g, appClientIdVal);

      const requestsAuthMode = config.requestsAuthMode ?? 'passthrough';
      const requestsAuthMethods = config.requestsAuthMethods ?? ['jwt'];
      let requests_auth: {
        mode: 'authenticate' | 'passthrough';
        methods?: ('jwt' | 'opaque' | 'api_key')[];
        jwt?: { allowed_issuers: string[]; allowed_audiences: string[] };
        opaque?: { endpoint: string; method: 'GET' | 'POST'; params: string; body: string };
      } | undefined;
      if (requestsAuthMode === 'passthrough') {
        requests_auth = { mode: 'passthrough', methods: [] };
      } else {
        const jwtIssuers = (config.allowedIssuers ?? []).length > 0 ? config.allowedIssuers!.map(substitutePlaceholders) : (appClientIdVal ? [`https://auth.apiblaze.com/${appClientIdVal}`] : []);
        const jwtAudiences = (config.allowedAudiences ?? []).length > 0 ? config.allowedAudiences!.map(substitutePlaceholders) : [...(projectNameVal ? [`https://${projectNameVal}.portal.apiblaze.com/${apiVersionVal}`] : []), ...(appClientIdVal ? [appClientIdVal] : [])];
        requests_auth = {
          mode: 'authenticate',
          methods: requestsAuthMethods,
          jwt: { allowed_issuers: jwtIssuers, allowed_audiences: jwtAudiences },
          opaque: requestsAuthMethods.includes('opaque') && config.opaqueTokenEndpoint
            ? { endpoint: config.opaqueTokenEndpoint, method: config.opaqueTokenMethod ?? 'GET', params: config.opaqueTokenParams ?? '?access_token={token}', body: config.opaqueTokenBody ?? 'token={token}' }
            : undefined,
        };
      }

      const payload: Record<string, unknown> = {
        default_app_client_id: config.defaultAppClient || null,
        requests_auth,
      };
      await updateProjectConfig(currentProject.project_id, currentProject.api_version, payload);
      toast({ title: 'Config Saved', description: 'Project configuration has been updated successfully.' });
      const updatedConfig = { ...(currentProject.config as Record<string, unknown>), ...payload };
      const updatedProject = { ...currentProject, config: updatedConfig };
      setCurrentProject(updatedProject);
      onProjectUpdate?.(updatedProject);
    } catch (error) {
      console.error('Failed to save config:', error);
      toast({
        title: 'Failed to Save Config',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsSavingConfig(false);
    }
  }, [currentProject, config, onProjectUpdate, toast]);

  const handleDelete = useCallback(async () => {
    if (!currentProject) return;
    setIsDeleting(true);
    try {
      await deleteProject(currentProject.project_id, currentProject.api_version);
      toast({ title: 'Project Deleted', description: `${currentProject.display_name || currentProject.project_id} has been deleted.` });
      setCurrentProject(null);
      await onDeploySuccess?.();
    } catch (error) {
      console.error('Failed to delete project:', error);
      toast({
        title: 'Failed to Delete Project',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  }, [currentProject, onDeploySuccess, toast]);

  const isNewProject = !currentProject;
  const currentStepIndex = NEW_PROJECT_STEPS.findIndex((s) => s.id === activeTab);
  const nextStep = currentStepIndex >= 0 && currentStepIndex < NEW_PROJECT_STEPS.length - 1
    ? NEW_PROJECT_STEPS[currentStepIndex + 1]
    : null;

  return (
    <div className="space-y-6">
      {/* Breadcrumb for new project - replaces submenu */}
      {isNewProject && (
        <nav className="flex items-center gap-1 text-sm flex-wrap" aria-label="Configuration steps">
          {NEW_PROJECT_STEPS.map((step, i) => (
            <span key={step.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
              <button
                type="button"
                onClick={() => setActiveTab(step.id)}
                className={cn(
                  'px-2 py-1 rounded transition-colors',
                  activeTab === step.id
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                {step.label}
              </button>
            </span>
          ))}
        </nav>
      )}

      <div className="space-y-6">
          {activeTab === 'general' && (
            <GeneralSection
              config={config}
              updateConfig={updateConfig}
              validationError={validationError}
              preloadedGitHubRepos={preloadedGitHubRepos}
              onProjectNameCheckResult={(blockDeploy) => setProjectNameCheckBlockDeploy(blockDeploy)}
              editingProject={currentProject ? { project_id: currentProject.project_id, api_version: currentProject.api_version, display_name: currentProject.display_name } : null}
              onDeleteAndRedeploy={currentProject ? handleDeploy : undefined}
              onDelete={currentProject ? handleDelete : undefined}
              isDeploying={isDeploying}
              isDeleting={isDeleting}
            />
          )}
          {activeTab === 'auth' && (
            <AuthenticationSection
              config={config}
              updateConfig={updateConfig}
              isEditMode={!!currentProject}
              project={currentProject}
              onProjectUpdate={(updated) => {
                setCurrentProject(updated);
                onProjectUpdate?.(updated);
              }}
              teamId={teamId}
            />
          )}
          {activeTab === 'targets' && (
            <TargetServersSection config={config} updateConfig={updateConfig} />
          )}
          {activeTab === 'throttling' && (
            <ThrottlingSection config={config} updateConfig={updateConfig} />
          )}
          {activeTab === 'routes' && currentProject && (
            <RoutesSection
              config={config}
              updateConfig={updateConfig}
              onGoToGeneral={() => setActiveTab('general')}
              project={{ project_id: currentProject.project_id, api_version: currentProject.api_version }}
              routesRef={routesRef}
            />
          )}
          {activeTab === 'preprocessing' && (
            <PrePostProcessingSection config={config} updateConfig={updateConfig} />
          )}
          {activeTab === 'domains' && (
            <DomainsSection config={config} />
          )}
        </div>

      <div className="flex items-center justify-between border-t pt-6">
        <div className="flex-1">
          {isNewProject ? (
            !isSourceConfigured() ? (
              <p className="text-sm text-orange-600">
                {validationError === 'github-source' && 'Select a GitHub repository to continue'}
                {validationError === 'target-url' && 'Enter a target URL to continue'}
                {validationError === 'upload-file' && 'Upload an OpenAPI spec to continue'}
                {validationError === 'project-name' && 'Enter a project name to continue'}
                {!validationError && 'Configure a source to deploy'}
              </p>
            ) : projectNameCheckBlockDeploy ? (
              <p className="text-sm text-red-600">Change project name or API version to continue.</p>
            ) : (
              <p className="text-sm text-muted-foreground">Ready to deploy! Customize other sections or deploy now.</p>
            )
          ) : (
            <p className="text-sm text-muted-foreground">Save your configuration changes without redeploying.</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button variant="outline" onClick={onCancel} disabled={isDeploying || isSavingConfig || isDeleting}>
              Cancel
            </Button>
          )}
          {isNewProject && nextStep && (
            <Button
              variant="secondary"
              onClick={() => setActiveTab(nextStep.id)}
              disabled={isDeploying}
            >
              Next Step – {nextStep.label}
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
          {isNewProject ? (
            <Button
              onClick={handleDeploy}
              disabled={isDeploying || !isSourceConfigured() || projectNameCheckBlockDeploy}
            >
              {isDeploying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deploying...
                </>
              ) : (
                <>
                  <Rocket className="mr-2 h-4 w-4" />
                  Deploy API
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleSaveConfig}
              disabled={isSavingConfig || isDeploying || isDeleting}
            >
              {isSavingConfig ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Updated Config
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
