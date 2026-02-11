export interface AuthConfig {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  app_clients_count?: number;
  users_count?: number;
  groups_count?: number;
  default_app_client_id?: string;
  enableSocialAuth?: boolean;
  enableApiKeyAuth?: boolean;
  bringMyOwnOAuth?: boolean;
}

export interface AppClient {
  id: string;
  name: string;
  clientId: string;
  clientSecret?: string; // Can be retrieved via getAppClient
  refreshTokenExpiry: number; // seconds
  idTokenExpiry: number;
  accessTokenExpiry: number;
  authorizedCallbackUrls: string[];
  signoutUris: string[];
  scopes: string[];
  jwks?: {
    keys: Array<{
      kty: string;
      use: string;
      kid: string;
      n: string;
      e: string;
      alg: string;
    }>;
  };
  created_at: string;
  updated_at: string;
  providers_count?: number;
}

export interface SocialProvider {
  id: string;
  type: 'google' | 'github' | 'microsoft' | 'facebook' | 'auth0' | 'other';
  clientId: string;
  clientSecret: string;
  domain?: string;
  tokenType?: 'apiblaze' | 'thirdParty';
  targetServerToken?: 'apiblaze' | 'third_party_access_token' | 'third_party_id_token' | 'none';
  includeApiblazeAccessTokenHeader?: boolean;
  includeApiblazeIdTokenHeader?: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAuthConfigRequest {
  name: string;
  enableSocialAuth?: boolean;
  enableApiKeyAuth?: boolean;
  bringMyOwnOAuth?: boolean;
}

export interface CreateAppClientRequest {
  name: string;
  refreshTokenExpiry?: number;
  idTokenExpiry?: number;
  accessTokenExpiry?: number;
  authorizedCallbackUrls?: string[];
  signoutUris?: string[];
  scopes?: string[];
}

export interface UpdateAppClientRequest {
  name?: string;
  refreshTokenExpiry?: number;
  idTokenExpiry?: number;
  accessTokenExpiry?: number;
  authorizedCallbackUrls?: string[];
  signoutUris?: string[];
  scopes?: string[];
}

export interface CreateProviderRequest {
  type: 'google' | 'github' | 'microsoft' | 'facebook' | 'auth0' | 'other';
  clientId: string;
  clientSecret: string;
  domain?: string;
  tokenType?: 'apiblaze' | 'thirdParty';
  targetServerToken?: 'apiblaze' | 'third_party_access_token' | 'third_party_id_token' | 'none';
  includeApiblazeAccessTokenHeader?: boolean;
  includeApiblazeIdTokenHeader?: boolean;
}

