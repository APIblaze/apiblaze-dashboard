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
}

const initialState: DashboardCacheState = {
  projects: [],
  authConfigs: [],
  appClientsByConfig: {},
  providersByConfigClient: {},
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
    // Bootstrap: max 2 requests. App clients and providers are lazy-loaded when user drills down.
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
      appClientsByConfig: {},
      providersByConfigClient: {},
      lastTeamId: teamId,
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
      });
    } catch {
      set({
        providersByConfigClient: {
          ...get().providersByConfigClient,
          [key]: [],
        },
      });
    }
  },
}));
