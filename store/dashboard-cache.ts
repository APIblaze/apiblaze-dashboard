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
  getProviders: (authConfigId: string, clientId: string) => SocialProvider[];
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
    const limit = 50;
    const allProjects: Project[] = [];
    let page = 1;
    let totalPages = 1;

    const fetchProjects = async () => {
      do {
        const res = await listProjects({
          team_id: teamId,
          page,
          limit,
          status: 'active',
        });
        allProjects.push(...res.projects);
        totalPages = res.pagination.total_pages;
        page++;
      } while (page <= totalPages && totalPages > 0);
    };

    const fetchAuthConfigs = () => api.listAuthConfigs();

    const [configs] = await Promise.all([
      fetchAuthConfigs() as Promise<AuthConfig[]>,
      fetchProjects(),
    ]);
    const authConfigs = Array.isArray(configs) ? configs : [];

    const appClientsByConfig: Record<string, AppClient[]> = {};
    await Promise.all(
      authConfigs.map(async (c) => {
        try {
          const clients = await api.listAppClients(c.id);
          appClientsByConfig[c.id] = Array.isArray(clients) ? clients : [];
        } catch {
          appClientsByConfig[c.id] = [];
        }
      })
    );

    const providersByConfigClient: Record<string, SocialProvider[]> = {};
    const providerPromises: Promise<void>[] = [];
    for (const config of authConfigs) {
      const clients = appClientsByConfig[config.id] ?? [];
      for (const client of clients) {
        providerPromises.push(
          (async () => {
            try {
              const providers = await api.listProviders(config.id, client.id);
              providersByConfigClient[`${config.id}-${client.id}`] = Array.isArray(providers)
                ? providers
                : [];
            } catch {
              providersByConfigClient[`${config.id}-${client.id}`] = [];
            }
          })()
        );
      }
    }
    await Promise.all(providerPromises);

    set({
      projects: allProjects,
      authConfigs,
      appClientsByConfig,
      providersByConfigClient,
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
  getProviders: (authConfigId, clientId) =>
    get().providersByConfigClient[`${authConfigId}-${clientId}`] ?? [],
}));
