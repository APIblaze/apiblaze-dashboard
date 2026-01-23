/**
 * API Client for Internal API
 * Handles communication with internalapi.apiblaze.com
 */

import type { UserPool, AppClient, SocialProvider } from '@/types/user-pool';

// Use Next.js API routes to proxy requests (keeps API key server-side)
const API_BASE_URL = '/api';

// API response may have snake_case fields from the database
type AppClientResponse = AppClient & {
  client_id?: string;
  redirect_uris?: string[];
  signout_uris?: string[];
};

type SocialProviderResponse = SocialProvider & {
  client_id?: string;
};

export interface ApiError {
  error: string;
  details?: string;
  code?: string;
}

export interface Project {
  id: string;
  name: string;
  subdomain: string;
  target_url?: string;
  openapi_spec?: string | Record<string, unknown>;
  created_at: string;
  updated_at: string;
  status: 'active' | 'inactive' | 'deploying';
}

export interface Team {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

/**
 * Base API client with authentication
 */
class ApiClient {
  private baseUrl: string;
  
  constructor() {
    this.baseUrl = API_BASE_URL;
  }
  
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    
    // Add timeout for fetch requests (30 seconds default)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
    
      if (!response.ok) {
        let error: ApiError = { error: `HTTP ${response.status}: ${response.statusText}` };
        try {
          error = (await response.json()) as ApiError;
        } catch {
          // Ignore JSON parse errors – default error message already set
        }
        throw new Error(error.error || 'API request failed');
      }
      
      // Handle 204 No Content responses (no body)
      if (response.status === 204) {
        return undefined as T;
      }
      
      // Check if response has content before trying to parse JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        return undefined as T;
      }
      
      return (await response.json()) as T;
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      
      // Handle abort (timeout) errors
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout: The request took too long to complete');
      }
      
      // Handle network errors (Failed to fetch)
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        throw new Error('Network error: Unable to reach the server. Please check your connection.');
      }
      
      // Re-throw other errors as-is
      throw error;
    }
  }
  
  // Projects
  async listProjects(): Promise<Project[]> {
    return this.request<Project[]>('/proxies');
  }

  async checkProjectExists(name?: string, subdomain?: string, apiVersion?: string): Promise<{ exists: boolean; project_id?: string; api_version?: string }> {
    const queryParams = new URLSearchParams();
    if (name) queryParams.append('name', name);
    if (subdomain) queryParams.append('subdomain', subdomain);
    if (apiVersion) queryParams.append('api_version', apiVersion);
    return this.request<{ exists: boolean; project_id?: string; api_version?: string }>(`/projects/check?${queryParams.toString()}`);
  }
  
  async getProject(id: string): Promise<Project> {
    return this.request<Project>(`/proxies/${id}`);
  }
  
  async createProject(data: {
    name: string;
    display_name?: string;
    subdomain: string;
    target_url?: string;
    openapi_spec?: string | Record<string, unknown>;
    team_id?: string;
    username?: string;
    github?: {
      owner: string;
      repo: string;
      path: string;
      branch?: string;
    };
    auth_type?: string;
    oauth_config?: {
      provider_type: string;
      client_id: string;
      client_secret: string;
      scopes: string;
    };
    user_pool_id?: string;
    app_client_id?: string;
    default_app_client_id?: string;
    environments?: Record<string, { target: string }>;
    throttling?: {
      userRateLimit: number;
      proxyDailyQuota: number;
      accountMonthlyQuota: number;
    };
  }): Promise<Record<string, unknown>> {
    // Map frontend data to backend API format
    const backendData: Record<string, unknown> = {
      target: data.target_url,
      target_url: data.target_url, // Support both formats
      openapi: data.openapi_spec,
      username: data.username,
    };

    // Add project name fields (these are now required by the worker)
    if (data.name) {
      backendData.name = data.name;
    }
    if (data.display_name) {
      backendData.display_name = data.display_name;
    }
    if (data.subdomain) {
      backendData.subdomain = data.subdomain;
    }

    // Add optional fields if provided
    if (data.github) {
      backendData.github = data.github;
    }
    if (data.auth_type) {
      backendData.auth_type = data.auth_type;
    }
    if (data.oauth_config) {
      backendData.oauth_config = data.oauth_config;
    }
    if (data.user_pool_id) {
      backendData.user_pool_id = data.user_pool_id;
    }
    if (data.app_client_id) {
      backendData.app_client_id = data.app_client_id;
    }
    if (data.default_app_client_id) {
      backendData.default_app_client_id = data.default_app_client_id;
    }
    if (data.environments) {
      backendData.environments = data.environments;
    }
    if (data.throttling) {
      backendData.throttling = data.throttling;
    }

    console.log('[API Client] Creating project:', data.name);
    return this.request<Record<string, unknown>>('/projects', {
      method: 'POST',
      body: JSON.stringify(backendData),
    });
  }
  
  async deleteProject(id: string): Promise<{ success: boolean }> {
    return this.request(`/delete-proxy/${id}`, {
      method: 'DELETE',
    });
  }
  
  // Teams
  async listTeams(): Promise<Team[]> {
    return this.request<Team[]>('/teams');
  }
  
  async createTeam(data: { name: string }): Promise<Team> {
    return this.request<Team>('/teams', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // UserPools
  async listUserPools() {
    return this.request<UserPool[]>('/user-pools');
  }

  async getUserPool(poolId: string): Promise<UserPool> {
    return this.request<UserPool>(`/user-pools/${poolId}`);
  }

  async createUserPool(data: { name: string; enableSocialAuth?: boolean; enableApiKeyAuth?: boolean; bringMyOwnOAuth?: boolean }) {
    return this.request('/user-pools', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateUserPool(poolId: string, data: { name?: string; default_app_client_id?: string; enableSocialAuth?: boolean; enableApiKeyAuth?: boolean; bringMyOwnOAuth?: boolean }) {
    return this.request(`/user-pools/${poolId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteUserPool(poolId: string) {
    return this.request(`/user-pools/${poolId}`, {
      method: 'DELETE',
    });
  }

  // AppClients
  async listAppClients(poolId: string) {
    return this.request<AppClient[]>(`/user-pools/${poolId}/app-clients`);
  }

  async getAppClient(poolId: string, clientId: string): Promise<AppClientResponse> {
    return this.request<AppClientResponse>(`/user-pools/${poolId}/app-clients/${clientId}`);
  }

  async createAppClient(poolId: string, data: {
    name: string;
    refreshTokenExpiry?: number;
    idTokenExpiry?: number;
    accessTokenExpiry?: number;
    redirectUris?: string[];
    signoutUris?: string[];
    scopes?: string[];
  }) {
    return this.request(`/user-pools/${poolId}/app-clients`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAppClient(poolId: string, clientId: string, data: {
    name?: string;
    refreshTokenExpiry?: number;
    idTokenExpiry?: number;
    accessTokenExpiry?: number;
    redirectUris?: string[];
    signoutUris?: string[];
    scopes?: string[];
  }) {
    return this.request(`/user-pools/${poolId}/app-clients/${clientId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteAppClient(poolId: string, clientId: string) {
    return this.request(`/user-pools/${poolId}/app-clients/${clientId}`, {
      method: 'DELETE',
    });
  }

  // Providers
  async listProviders(poolId: string, clientId: string): Promise<SocialProviderResponse[]> {
    return this.request<SocialProviderResponse[]>(`/user-pools/${poolId}/app-clients/${clientId}/providers`);
  }

  async addProvider(poolId: string, clientId: string, data: {
    type: string;
    clientId: string;
    clientSecret: string;
    domain?: string;
    tokenType?: 'apiblaze' | 'thirdParty';
  }) {
    return this.request(`/user-pools/${poolId}/app-clients/${clientId}/providers`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProvider(poolId: string, clientId: string, providerId: string, data: {
    type: string;
    clientId: string;
    clientSecret: string;
    domain?: string;
    tokenType?: 'apiblaze' | 'thirdParty';
  }) {
    return this.request(`/user-pools/${poolId}/app-clients/${clientId}/providers/${providerId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async removeProvider(poolId: string, clientId: string, providerId: string) {
    return this.request(`/user-pools/${poolId}/app-clients/${clientId}/providers/${providerId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Create UserPool, AppClient, and Provider with default GitHub credentials
   * This keeps the GitHub client secret server-side only
   */
  async createUserPoolWithDefaultGitHub(data: {
    userPoolName: string;
    appClientName: string;
    scopes?: string[];
    enableSocialAuth?: boolean;
    enableApiKeyAuth?: boolean;
    bringMyOwnOAuth?: boolean;
  }) {
    return this.request<{ userPoolId: string; appClientId: string }>('/user-pools/create-with-default-github', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // TODO: Users and Groups management methods
  // These will be implemented when the backend API routes are available:
  // - listUsers(poolId: string)
  // - getUser(poolId: string, userId: string)
  // - createUser(poolId: string, data: {...})
  // - updateUser(poolId: string, userId: string, data: {...})
  // - deleteUser(poolId: string, userId: string)
  // - listGroups(poolId: string)
  // - getGroup(poolId: string, groupId: string)
  // - createGroup(poolId: string, data: {...})
  // - updateGroup(poolId: string, groupId: string, data: {...})
  // - deleteGroup(poolId: string, groupId: string)
}

export const api = new ApiClient();




