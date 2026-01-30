/**
 * APIBlaze Admin API Client
 * 
 * Handles authenticated requests to the internal admin API with JWT user assertions
 */

import { createJWTSigner, UserAssertionClaims } from './jwt-signer';

type APIErrorBody = {
  error?: string;
  details?: unknown;
  suggestions?: unknown;
};

export interface CreateProxyPayload {
  target?: string;
  target_url?: string;
  name?: string;
  display_name?: string;
  subdomain?: string;
  auth_type?: 'none' | 'api_key' | 'oauth';
  openapi?: string;
  github?: {
    owner: string;
    repo: string;
    path: string;
    branch?: string;
  };
  oauth_config?: {
    provider_type: string;
    client_id: string;
    client_secret: string;
    scopes?: string;
  };
  auth_config_id?: string;
  app_client_id?: string;
  default_app_client_id?: string;
  environments?: Record<string, { target: string; description?: string }>;
  throttling?: {
    userRateLimit: number;
    proxyDailyQuota: number;
    accountMonthlyQuota: number;
  };
}

interface APIBlazeClientOptions {
  apiKey: string;
  baseUrl?: string;
  jwtPrivateKey?: string;
  jwtPrivateKeyPath?: string;
}

export class APIBlazeError extends Error {
  status: number;
  body: APIErrorBody;

  constructor(status: number, body: APIErrorBody) {
    super(body?.error ?? `HTTP ${status}`);
    this.name = 'APIBlazeError';
    this.status = status;
    this.body = body;
  }
}

export class APIBlazeClient {
  private apiKey: string;
  private baseUrl: string;
  private jwtSigner: ReturnType<typeof createJWTSigner>;

  constructor(options: APIBlazeClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://internalapi.apiblaze.com';
    
    this.jwtSigner = createJWTSigner({
      privateKey: options.jwtPrivateKey,
      privateKeyPath: options.jwtPrivateKeyPath,
    });
  }

  /**
   * Make an authenticated request to the admin API
   */
  async request<T = unknown>(
    path: string,
    options: RequestInit & {
      userClaims: UserAssertionClaims;
    }
  ): Promise<T> {
    const { userClaims, ...fetchOptions } = options;
    
    // Prepare headers
    const headers = new Headers(fetchOptions.headers);
    headers.set('Content-Type', 'application/json');
    headers.set('X-API-KEY', this.apiKey);
    
    // Create JWT user assertion with body hash binding
    const userAssertion = this.jwtSigner.createAuthHeader(
      userClaims,
      fetchOptions.body
    );
    headers.set('X-User-Assertion', userAssertion);
    
    // Make request
    const fullUrl = `${this.baseUrl}${path}`;
    console.log('APIBlaze request:', {
      method: fetchOptions.method || 'GET',
      url: fullUrl,
      hasBody: !!fetchOptions.body,
    });
    
    const response = await fetch(fullUrl, {
      ...fetchOptions,
      headers,
    });
    
    // Handle 204 No Content responses first (before checking response.ok)
    // These responses have no body and should be treated as success
    if (response.status === 204 || response.status === 205 || response.status === 304) {
      return undefined as T;
    }
    
    if (!response.ok) {
      let errorBody: APIErrorBody = { error: 'Unknown error' };
      try {
        errorBody = (await response.json()) as APIErrorBody;
      } catch (jsonError) {
        // If JSON parsing fails, try to get the response text
        try {
          const responseText = await response.text();
          console.error('Failed to parse error body from APIBlaze response:', {
            status: response.status,
            statusText: response.statusText,
            url: `${this.baseUrl}${path}`,
            responseText: responseText.substring(0, 500), // Limit to first 500 chars
            jsonError,
          });
          errorBody = { 
            error: `HTTP ${response.status}: ${response.statusText}`,
            details: responseText.substring(0, 500),
          };
        } catch (textError) {
          console.error('Failed to parse error body from APIBlaze response:', {
            status: response.status,
            statusText: response.statusText,
            url: `${this.baseUrl}${path}`,
            jsonError,
            textError,
          });
          errorBody = { 
            error: `HTTP ${response.status}: ${response.statusText}`,
          };
        }
      }
      
      // Special handling: If DELETE operation returns 500 with "204 response cannot have body" error,
      // treat it as success since the deletion actually succeeded (backend bug)
      const method = fetchOptions.method || 'GET';
      if (method === 'DELETE' && 
          response.status === 500 && 
          (errorBody.details?.toString().includes('204') || 
           errorBody.details?.toString().includes('null body status'))) {
        console.warn('Backend returned 500 for DELETE but operation succeeded (204 body error), treating as success');
        return undefined as T;
      }
      
      throw new APIBlazeError(response.status, errorBody);
    }
    
    // Check if response has content
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      // If no JSON content type, return empty object or undefined
      return undefined as T;
    }
    
    const responseBody = (await response.json()) as T;
    return responseBody;
  }

  /**
   * Create a new proxy
   */
  async createProxy(
    userClaims: UserAssertionClaims,
    proxyData: CreateProxyPayload
  ) {
    return this.request('/', {
      method: 'POST',
      body: JSON.stringify(proxyData),
      userClaims,
    });
  }

  /**
   * List proxies
   */
  async checkProjectExists(userClaims: UserAssertionClaims, name?: string, subdomain?: string, apiVersion?: string): Promise<{ exists: boolean; project_id?: string; api_version?: string }> {
    const queryParams = new URLSearchParams();
    if (name) queryParams.append('name', name);
    if (subdomain) queryParams.append('subdomain', subdomain);
    if (apiVersion) queryParams.append('api_version', apiVersion);
    
    return this.request(`/projects/check?${queryParams.toString()}`, {
      method: 'GET',
      userClaims,
    });
  }

  async listProxies(userClaims: UserAssertionClaims, params?: {
    page?: number;
    limit?: number;
    search?: string;
    team_id?: string;
    status?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.search) queryParams.set('search', params.search);
    if (params?.team_id) queryParams.set('team_id', params.team_id);
    if (params?.status) queryParams.set('status', params.status);
    
    const query = queryParams.toString();
    return this.request(`/projects${query ? `?${query}` : ''}`, {
      method: 'GET',
      userClaims,
    });
  }

  /**
   * Delete a proxy
   */
  async deleteProxy(
    userClaims: UserAssertionClaims,
    projectId: string,
    version: string
  ) {
    return this.request(`/${projectId}/${version}`, {
      method: 'DELETE',
      userClaims,
    });
  }

  /**
   * Get project status
   */
  async getProjectStatus(userClaims: UserAssertionClaims, projectId: string) {
    return this.request(`/projects/${projectId}/status`, {
      method: 'GET',
      userClaims,
    });
  }

  /**
   * Update project config (without redeployment)
   */
  async updateProxyConfig(
    userClaims: UserAssertionClaims,
    projectId: string,
    version: string,
    config: Record<string, unknown>
  ) {
    return this.request(`/${projectId}/${version}/config`, {
      method: 'PATCH',
      body: JSON.stringify(config),
      userClaims,
    });
  }

  /**
   * AuthConfig methods
   */
  async createAuthConfig(
    userClaims: UserAssertionClaims,
    data: { name: string; enableSocialAuth?: boolean; enableApiKeyAuth?: boolean; bringMyOwnOAuth?: boolean }
  ) {
    return this.request('/auth-configs', {
      method: 'POST',
      body: JSON.stringify(data),
      userClaims,
    });
  }

  async listAuthConfigs(userClaims: UserAssertionClaims) {
    return this.request('/auth-configs', {
      method: 'GET',
      userClaims,
    });
  }

  async getAuthConfig(userClaims: UserAssertionClaims, authConfigId: string) {
    return this.request(`/auth-configs/${authConfigId}`, {
      method: 'GET',
      userClaims,
    });
  }

  async updateAuthConfig(
    userClaims: UserAssertionClaims,
    authConfigId: string,
    data: { name?: string; default_app_client_id?: string; enableSocialAuth?: boolean; enableApiKeyAuth?: boolean; bringMyOwnOAuth?: boolean }
  ) {
    return this.request(`/auth-configs/${authConfigId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      userClaims,
    });
  }

  async deleteAuthConfig(userClaims: UserAssertionClaims, authConfigId: string) {
    return this.request(`/auth-configs/${authConfigId}`, {
      method: 'DELETE',
      userClaims,
    });
  }

  /**
   * AppClient methods
   */
  async createAppClient(
    userClaims: UserAssertionClaims,
    authConfigId: string,
    data: {
      name: string;
      refreshTokenExpiry?: number;
      idTokenExpiry?: number;
      accessTokenExpiry?: number;
      authorizedCallbackUrls?: string[];
      signoutUris?: string[];
      scopes?: string[];
    }
  ) {
    return this.request(`/auth-configs/${authConfigId}/app-clients`, {
      method: 'POST',
      body: JSON.stringify(data),
      userClaims,
    });
  }

  async listAppClients(userClaims: UserAssertionClaims, authConfigId: string) {
    return this.request(`/auth-configs/${authConfigId}/app-clients`, {
      method: 'GET',
      userClaims,
    });
  }

  async getAppClient(
    userClaims: UserAssertionClaims,
    authConfigId: string,
    clientId: string
  ) {
    return this.request(`/auth-configs/${authConfigId}/app-clients/${clientId}`, {
      method: 'GET',
      userClaims,
    });
  }

  async getAppClientSecret(
    userClaims: UserAssertionClaims,
    authConfigId: string,
    clientId: string
  ): Promise<{ clientSecret: string }> {
    return this.request(`/auth-configs/${authConfigId}/app-clients/${clientId}/secret`, {
      method: 'GET',
      userClaims,
    });
  }

  async updateAppClient(
    userClaims: UserAssertionClaims,
    authConfigId: string,
    clientId: string,
    data: {
      name?: string;
      refreshTokenExpiry?: number;
      idTokenExpiry?: number;
      accessTokenExpiry?: number;
      authorizedCallbackUrls?: string[];
      signoutUris?: string[];
      scopes?: string[];
    }
  ) {
    return this.request(`/auth-configs/${authConfigId}/app-clients/${clientId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      userClaims,
    });
  }

  async deleteAppClient(
    userClaims: UserAssertionClaims,
    authConfigId: string,
    clientId: string
  ) {
    return this.request(`/auth-configs/${authConfigId}/app-clients/${clientId}`, {
      method: 'DELETE',
      userClaims,
    });
  }

  /**
   * Provider methods
   */
  async addProvider(
    userClaims: UserAssertionClaims,
    authConfigId: string,
    clientId: string,
    data: {
      type: string;
      clientId: string;
      clientSecret: string;
      domain?: string;
    }
  ) {
    return this.request(`/auth-configs/${authConfigId}/app-clients/${clientId}/providers`, {
      method: 'POST',
      body: JSON.stringify(data),
      userClaims,
    });
  }

  async listProviders(
    userClaims: UserAssertionClaims,
    authConfigId: string,
    clientId: string
  ) {
    return this.request(`/auth-configs/${authConfigId}/app-clients/${clientId}/providers`, {
      method: 'GET',
      userClaims,
    });
  }

  async removeProvider(
    userClaims: UserAssertionClaims,
    authConfigId: string,
    clientId: string,
    providerId: string
  ) {
    return this.request(`/auth-configs/${authConfigId}/app-clients/${clientId}/providers/${providerId}`, {
      method: 'DELETE',
      userClaims,
    });
  }

  async getProviderSecret(
    userClaims: UserAssertionClaims,
    authConfigId: string,
    clientId: string,
    providerId: string
  ): Promise<{ clientSecret: string }> {
    return this.request(`/auth-configs/${authConfigId}/app-clients/${clientId}/providers/${providerId}/secret`, {
      method: 'GET',
      userClaims,
    });
  }
}

/**
 * Create an APIBlaze client instance
 */
export function createAPIBlazeClient(options: APIBlazeClientOptions): APIBlazeClient {
  return new APIBlazeClient(options);
}

/**
 * Example usage in Next.js API route:
 * 
 * ```typescript
 * import { createAPIBlazeClient } from '@/lib/apiblaze-client';
 * import { getServerSession } from 'next-auth/next';
 * 
 * export async function POST(req: Request) {
 *   const session = await getServerSession();
 *   if (!session) {
 *     return Response.json({ error: 'Unauthorized' }, { status: 401 });
 *   }
 * 
 *   const client = createAPIBlazeClient({
 *     apiKey: process.env.APIBLAZE_ADMIN_API_KEY!,
 *   });
 * 
 *   const result = await client.createProxy(
 *     {
 *       sub: session.user.id,
 *       handle: session.user.name || 'anonymous',
 *       email: session.user.email,
 *       roles: ['admin'],
 *     },
 *     {
 *       target: 'https://httpbin.org',
 *       auth_type: 'api_key',
 *     }
 *   );
 * 
 *   return Response.json(result);
 * }
 * ```
 */

