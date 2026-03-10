/**
 * Dashboard client cache for projects, auth configs, app clients, and providers.
 * Bootstrap once on initial dashboard load; consumers read from cache only.
 * Invalidate and refetch after project deploy (and optionally auth-configs CRUD).
 * In-memory only—no persistence.
 */

import { create } from 'zustand';

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(patch)) {
    const patchVal = patch[key];
    const baseVal = base[key];
    if (
      patchVal !== null &&
      typeof patchVal === 'object' &&
      !Array.isArray(patchVal) &&
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(baseVal as Record<string, unknown>, patchVal as Record<string, unknown>);
    } else {
      result[key] = patchVal;
    }
  }
  return result;
}
import { listProjects } from '@/lib/api/projects';
import { api } from '@/lib/api';
import type { Project } from '@/types/project';
import type { AuthConfig, AppClient, SocialProvider } from '@/types/auth-config';

export interface DashboardCacheState {
  projects: Project[];
  authConfigs: AuthConfig[];
  appClientsByConfig: Record<string, AppClient[]>;
  providersByConfigClient: Record<string, SocialProvider[]>;
  /** Per-key errors when provider fetch fails (key = tenantKey or tenant:teamId:tenantName:clientId) */
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
  /** Get app clients for tenant (tenantKey = tenant:teamId:tenantName). */
  getAppClients: (tenantKey: string) => AppClient[];
  getAppClient: (tenantKey: string, clientId: string) => AppClient | undefined;
  /** Find app client by client id across all tenants. Returns tenantKey and appClient. */
  getAppClientWithTenant: (clientId: string) => { tenantKey: string; appClient: AppClient } | undefined;
  getProviders: (tenantKey: string, clientId: string) => SocialProvider[];
  /** Update a single project's config in cache after a PATCH save. Avoids full invalidateAndRefetch. */
  updateProjectInCache: (projectId: string, apiVersion: string, configPatch: Record<string, unknown>) => void;
  /** Update a single app client in cache (e.g. after verify). */
  updateAppClientInCache: (tenantKey: string, clientId: string, patch: Partial<AppClient>) => void;
  /** Tenant-only: lazy-load app clients for a tenant. */
  fetchAppClientsForTenant: (teamId: string, tenantName: string) => Promise<void>;
  /** Tenant-only: lazy-load providers for an app client under a tenant. */
  fetchProvidersForTenant: (teamId: string, tenantName: string, clientId: string) => Promise<void>;
  /** Tenant-only: get app clients for a tenant (from cache). */
  getAppClientsForTenant: (teamId: string, tenantName: string) => AppClient[];
  /** Tenant-only: get providers for an app client under a tenant (from cache). */
  getProvidersForTenant: (teamId: string, tenantName: string, clientId: string) => SocialProvider[];
  /** Tenant-only: get provider fetch error for a tenant client, if any. */
  getProvidersErrorForTenant: (teamId: string, tenantName: string, clientId: string) => string | null;
  /** Tenant-only: clear provider error and cached providers for a tenant client (allows retry). */
  clearProvidersForRetryForTenant: (teamId: string, tenantName: string, clientId: string) => void;
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
    // 1. Fetch projects and, when we have a team, tenants for that team (tenant-only; no auth-configs).
    const [projectsRes, tenantsRes] = await Promise.all([
      listProjects({
        team_id: teamId,
        page: 1,
        limit: 50,
        status: 'active',
      }),
      teamId ? api.getTeamTenants(teamId, true).catch(() => ({ tenants: [] })) : Promise.resolve({ tenants: [] }),
    ]);
    const allProjects = projectsRes.projects ?? [];
    const tenantsList = Array.isArray((tenantsRes as { tenants?: unknown }).tenants)
      ? (tenantsRes as { tenants: Array<{ tenant_name?: string; display_name?: string } | string> }).tenants
      : [];
    // Map tenants to AuthConfig-like shape so nav and other consumers see "tenants" as the list.
    const authConfigs: AuthConfig[] = tenantsList.map((t) => {
      if (typeof t === 'string') {
        return { id: t, name: t, created_at: '', updated_at: '' };
      }
      const name = (t?.display_name ?? t?.tenant_name ?? '').trim() || (t?.tenant_name ?? '');
      return {
        id: t?.tenant_name ?? '',
        name: name || (t?.tenant_name ?? ''),
        created_at: '',
        updated_at: '',
      };
    }).filter((c) => c.id);

    // 2. Preload app clients and providers for each tenant so Auth tab is instant when opened.
    let appClientsByConfig: Record<string, AppClient[]> = {};
    let providersByConfigClient: Record<string, SocialProvider[]> = {};
    const providersErrorByKey: Record<string, string> = {};

    if (teamId && tenantsList.length > 0) {
      const tenantNames = tenantsList.map((t) =>
        typeof t === 'string' ? t : (t?.tenant_name ?? '')
      ).filter(Boolean);

      const tenantResults = await Promise.all(
        tenantNames.map(async (tenantName): Promise<{ appClients: Record<string, AppClient[]>; providers: Record<string, SocialProvider[]> }> => {
          try {
            const clients = await api.listAppClientsByTenant(teamId, tenantName);
            const clientsList = Array.isArray(clients) ? clients : [];
            const key = `tenant:${teamId}:${tenantName}`;
            const appClients: Record<string, AppClient[]> = { [key]: clientsList };

            const providers: Record<string, SocialProvider[]> = {};
            for (const client of clientsList) {
              try {
                const provList = await api.listProvidersByTenant(teamId, tenantName, client.id);
                providers[`tenant:${teamId}:${tenantName}:${client.id}`] = Array.isArray(provList) ? provList : [];
              } catch {
                providers[`tenant:${teamId}:${tenantName}:${client.id}`] = [];
              }
            }
            return { appClients, providers };
          } catch {
            return { appClients: { [`tenant:${teamId}:${tenantName}`]: [] }, providers: {} };
          }
        })
      );

      appClientsByConfig = Object.assign({}, ...tenantResults.map((r) => r.appClients));
      providersByConfigClient = Object.assign({}, ...tenantResults.map((r) => r.providers));
    }

    set({
      projects: allProjects,
      authConfigs,
      appClientsByConfig,
      providersByConfigClient,
      providersErrorByKey,
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
  getAppClients: (tenantKey) => get().appClientsByConfig[tenantKey] ?? [],
  getAppClient: (tenantKey, clientId) =>
    (get().appClientsByConfig[tenantKey] ?? []).find((c) => c.id === clientId),
  getAppClientWithTenant: (clientId) => {
    for (const [tenantKey, clients] of Object.entries(get().appClientsByConfig)) {
      const appClient = clients.find((c) => c.id === clientId);
      if (appClient) return { tenantKey, appClient };
    }
    return undefined;
  },
  getProviders: (tenantKey, clientId) =>
    get().providersByConfigClient[`${tenantKey}:${clientId}`] ?? get().providersByConfigClient[`${tenantKey}-${clientId}`] ?? [],

  updateProjectInCache: (projectId, apiVersion, configPatch) => {
    const projects = get().projects;
    const idx = projects.findIndex(
      (p) => p.project_id === projectId && p.api_version === apiVersion
    );
    if (idx < 0) return;
    const existing = projects[idx];
    const updated = {
      ...existing,
      config: deepMerge(existing.config as Record<string, unknown> ?? {}, configPatch),
    };
    set({ projects: [...projects.slice(0, idx), updated, ...projects.slice(idx + 1)] });
  },

  updateAppClientInCache: (tenantKey, clientId, patch) => {
    const clients = get().appClientsByConfig[tenantKey] ?? [];
    const idx = clients.findIndex((c) => c.id === clientId);
    if (idx < 0) return;
    const updated = { ...clients[idx], ...patch };
    set({
      appClientsByConfig: {
        ...get().appClientsByConfig,
        [tenantKey]: [...clients.slice(0, idx), updated, ...clients.slice(idx + 1)],
      },
    });
  },

  getAppClientsForTenant: (teamId, tenantName) =>
    get().appClientsByConfig[`tenant:${teamId}:${tenantName}`] ?? [],

  getProvidersForTenant: (teamId, tenantName, clientId) =>
    get().providersByConfigClient[`tenant:${teamId}:${tenantName}:${clientId}`] ?? [],

  getProvidersErrorForTenant: (teamId, tenantName, clientId) =>
    get().providersErrorByKey[`tenant:${teamId}:${tenantName}:${clientId}`] ?? null,

  clearProvidersForRetryForTenant: (teamId, tenantName, clientId) => {
    const key = `tenant:${teamId}:${tenantName}:${clientId}`;
    const nextProviders = { ...get().providersByConfigClient };
    const nextErrors = { ...get().providersErrorByKey };
    delete nextProviders[key];
    delete nextErrors[key];
    set({ providersByConfigClient: nextProviders, providersErrorByKey: nextErrors });
  },

  fetchAppClientsForTenant: async (teamId, tenantName) => {
    const key = `tenant:${teamId}:${tenantName}`;
    if (key in get().appClientsByConfig) return;
    try {
      const clients = await api.listAppClientsByTenant(teamId, tenantName);
      set({
        appClientsByConfig: {
          ...get().appClientsByConfig,
          [key]: Array.isArray(clients) ? clients : [],
        },
      });
    } catch {
      set({
        appClientsByConfig: {
          ...get().appClientsByConfig,
          [key]: [],
        },
      });
    }
  },

  fetchProvidersForTenant: async (teamId, tenantName, clientId) => {
    const key = `tenant:${teamId}:${tenantName}:${clientId}`;
    if (key in get().providersByConfigClient) return;
    try {
      const providers = await api.listProvidersByTenant(teamId, tenantName, clientId);
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
}));
