/**
 * Dashboard client cache for projects, auth configs, app clients, and providers.
 * Bootstrap once on initial dashboard load; consumers read from cache only.
 * Invalidate and refetch after project deploy (and optionally auth-configs CRUD).
 * In-memory only—no persistence.
 */

import { create } from 'zustand';
import { listProjects } from '@/lib/api/projects';
import { api } from '@/lib/api';
import type { Project } from '@/types/project';
import type { AuthConfig, AppClient, SocialProvider } from '@/types/auth-config';

export interface DashboardCacheState {
  projects: Project[];
  authConfigs: AuthConfig[];
  appClientsByConfig: Record<string, AppClient[]>;
  providersByConfigClient: Record<string, SocialProvider[]>;
  /** Per-key errors when provider fetch fails (key = `${authConfigId}-${clientId}`) */
  providersErrorByKey: Record<string, string>;
  lastTeamId: string | undefined;
  isBootstrapping: boolean;
  error: string | null;
}

export interface DashboardCacheActions {
  setCache: (data: {
    projects: Project[];
    authConfigs: AuthConfig[];
    appClientsByConfig: Record<string, AppClient[]>;
    providersByConfigClient: Record<string, SocialProvider[]>;
    lastTeamId?: string;
  }) => void;
  clearCache: () => void;
  fetchBootstrap: (teamId?: string) => Promise<void>;
  invalidateAndRefetch: (teamId?: string) => Promise<void>;
  getProjects: () => Project[];
  getAuthConfigs: () => AuthConfig[];
  getAuthConfig: (id: string) => AuthConfig | undefined;
  getAppClients: (authConfigId: string) => AppClient[];
  getAppClient: (authConfigId: string, clientId: string) => AppClient | undefined;
  /** Find app client by client id across all auth configs. Returns authConfigId and appClient. */
  getAppClientWithAuthConfig: (clientId: string) => { authConfigId: string; appClient: AppClient } | undefined;
  getProviders: (authConfigId: string, clientId: string) => SocialProvider[];
  /** Update a single app client in cache (e.g. after verify). Avoids full invalidateAndRefetch. */
  updateAppClientInCache: (authConfigId: string, clientId: string, patch: Partial<AppClient>) => void;
  /** Set app clients for a config (e.g. from lookup or lazy fetch). */
  setAppClientsForConfig: (authConfigId: string, clients: AppClient[]) => void;
  /** Lazy-load app clients for a config. No-op if already loaded. */
  fetchAppClientsForConfig: (authConfigId: string) => Promise<void>;
  /** Lazy-load providers for an app client. No-op if already loaded. */
  fetchProvidersForClient: (authConfigId: string, clientId: string) => Promise<void>;
  /** Get provider fetch error for a client, if any. */
  getProvidersError: (authConfigId: string, clientId: string) => string | null;
  /** Clear provider error and cached providers for a client (allows retry). */
  clearProvidersForRetry: (authConfigId: string, clientId: string) => void;
}

const initialState: DashboardCacheState = {
  projects: [],
  authConfigs: [],
  appClientsByConfig: {},
  providersByConfigClient: {},
  providersErrorByKey: {},
  lastTeamId: undefined,
  isBootstrapping: false,
  error: null,
};

async function fetchBootstrapImpl(
  teamId: string | undefined,
  set: (partial: Partial<DashboardCacheState> | ((s: DashboardCacheState) => Partial<DashboardCacheState>)) => void,
  get: () => DashboardCacheState
): Promise<void> {
  set({ isBootstrapping: true, error: null });
  try {
    // 1. Fetch auth configs and projects in parallel
    const [configs, projectsRes] = await Promise.all([
      api.listAuthConfigs() as Promise<AuthConfig[]>,
      listProjects({
        team_id: teamId,
        page: 1,
        limit: 50,
        status: 'active',
      }),
    ]);
    const authConfigs = Array.isArray(configs) ? configs : [];
    const allProjects = projectsRes.projects ?? [];

    set({
      projects: allProjects,
      authConfigs,
      lastTeamId: teamId,
    });

    // 2. Collect unique auth_config_ids from projects and auth configs
    const authConfigIds = new Set<string>();
    for (const c of authConfigs) authConfigIds.add(c.id);
    for (const p of allProjects) {
      const cfg = p.config as Record<string, unknown> | undefined;
      const id = (cfg?.auth_config_id || cfg?.user_pool_id) as string | undefined;
      if (id) authConfigIds.add(id);
    }

    // 3. Fetch app clients for each auth config
    const appClientsByConfig: Record<string, AppClient[]> = {};
    await Promise.all(
      Array.from(authConfigIds).map(async (authConfigId) => {
        try {
          const clients = await api.listAppClients(authConfigId);
          appClientsByConfig[authConfigId] = Array.isArray(clients) ? clients : [];
        } catch {
          appClientsByConfig[authConfigId] = [];
        }
      })
    );

    // 4. Fetch providers for each app client
    const providersByConfigClient: Record<string, SocialProvider[]> = {};
    const providersErrorByKey: Record<string, string> = {};
    await Promise.all(
      Object.entries(appClientsByConfig).flatMap(([authConfigId, clients]) =>
        clients.map(async (client) => {
          const key = `${authConfigId}-${client.id}`;
          try {
            const providers = await api.listProviders(authConfigId, client.id);
            providersByConfigClient[key] = Array.isArray(providers) ? providers : [];
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Failed to load providers';
            providersErrorByKey[key] = message;
            providersByConfigClient[key] = [];
          }
        })
      )
    );

    set({
      appClientsByConfig,
      providersByConfigClient,
      providersErrorByKey,
      isBootstrapping: false,
      error: null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load dashboard data';
    set({
      isBootstrapping: false,
      error: message,
    });
    throw e;
  }
}

export const useDashboardCacheStore = create<DashboardCacheState & DashboardCacheActions>((set, get) => ({
  ...initialState,

  setCache: (data) =>
    set({
      projects: data.projects,
      authConfigs: data.authConfigs,
      appClientsByConfig: data.appClientsByConfig,
      providersByConfigClient: data.providersByConfigClient,
      providersErrorByKey: {},
      lastTeamId: data.lastTeamId ?? get().lastTeamId,
      error: null,
    }),

  clearCache: () => set(initialState),

  fetchBootstrap: (teamId) =>
    fetchBootstrapImpl(teamId, set, get),

  invalidateAndRefetch: async (teamId) => {
    set(initialState);
    const effectiveTeamId = teamId ?? get().lastTeamId;
    await fetchBootstrapImpl(effectiveTeamId, set, get);
  },

  getProjects: () => get().projects,
  getAuthConfigs: () => get().authConfigs,
  getAuthConfig: (id) => get().authConfigs.find((c) => c.id === id),
  getAppClients: (authConfigId) => get().appClientsByConfig[authConfigId] ?? [],
  getAppClient: (authConfigId, clientId) =>
    (get().appClientsByConfig[authConfigId] ?? []).find((c) => c.id === clientId),
  getAppClientWithAuthConfig: (clientId) => {
    for (const [authConfigId, clients] of Object.entries(get().appClientsByConfig)) {
      const appClient = clients.find((c) => c.id === clientId);
      if (appClient) return { authConfigId, appClient };
    }
    return undefined;
  },
  getProviders: (authConfigId, clientId) =>
    get().providersByConfigClient[`${authConfigId}-${clientId}`] ?? [],

  updateAppClientInCache: (authConfigId, clientId, patch) => {
    const clients = get().appClientsByConfig[authConfigId] ?? [];
    const idx = clients.findIndex((c) => c.id === clientId);
    if (idx < 0) return;
    const updated = { ...clients[idx], ...patch };
    set({
      appClientsByConfig: {
        ...get().appClientsByConfig,
        [authConfigId]: [...clients.slice(0, idx), updated, ...clients.slice(idx + 1)],
      },
    });
  },

  setAppClientsForConfig: (authConfigId, clients) => {
    set({
      appClientsByConfig: {
        ...get().appClientsByConfig,
        [authConfigId]: Array.isArray(clients) ? clients : [],
      },
    });
  },

  fetchAppClientsForConfig: async (authConfigId) => {
    if (authConfigId in get().appClientsByConfig) return;
    try {
      const clients = await api.listAppClients(authConfigId);
      set({
        appClientsByConfig: {
          ...get().appClientsByConfig,
          [authConfigId]: Array.isArray(clients) ? clients : [],
        },
      });
    } catch {
      set({
        appClientsByConfig: {
          ...get().appClientsByConfig,
          [authConfigId]: [],
        },
      });
    }
  },

  fetchProvidersForClient: async (authConfigId, clientId) => {
    const key = `${authConfigId}-${clientId}`;
    if (key in get().providersByConfigClient) return;
    try {
      const providers = await api.listProviders(authConfigId, clientId);
      set({
        providersByConfigClient: {
          ...get().providersByConfigClient,
          [key]: Array.isArray(providers) ? providers : [],
        },
        providersErrorByKey: (() => {
          const next = { ...get().providersErrorByKey };
          delete next[key];
          return next;
        })(),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load providers';
      console.error('[fetchProvidersForClient]', { authConfigId, clientId, error: message });
      set({
        providersByConfigClient: {
          ...get().providersByConfigClient,
          [key]: [],
        },
        providersErrorByKey: {
          ...get().providersErrorByKey,
          [key]: message,
        },
      });
    }
  },

  getProvidersError: (authConfigId, clientId) =>
    get().providersErrorByKey[`${authConfigId}-${clientId}`] ?? null,

  clearProvidersForRetry: (authConfigId, clientId) => {
    const key = `${authConfigId}-${clientId}`;
    const nextProviders = { ...get().providersByConfigClient };
    const nextErrors = { ...get().providersErrorByKey };
    delete nextProviders[key];
    delete nextErrors[key];
    set({ providersByConfigClient: nextProviders, providersErrorByKey: nextErrors });
  },
}));
