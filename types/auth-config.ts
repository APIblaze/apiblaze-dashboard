export interface AppClientBranding {
  loginPageLogo?: string;
  loginPageHeaderText?: string;
  loginPageSubtitle?: string;
  primaryColor?: string;
  useGradient?: boolean;
}

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
  verified?: boolean;
  branding?: AppClientBranding;
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
  /** Space-separated or array of scopes for this provider (used for /authorize and /token with the provider) */
  scopes: string[] | string;
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
  projectName: string;
  apiVersion: string;
  refreshTokenExpiry?: number;
  idTokenExpiry?: number;
  accessTokenExpiry?: number;
  authorizedCallbackUrls?: string[];
  signoutUris?: string[];
  scopes?: string[];
  branding?: AppClientBranding;
}

export interface UpdateAppClientRequest {
  name?: string;
  refreshTokenExpiry?: number;
  idTokenExpiry?: number;
  accessTokenExpiry?: number;
  authorizedCallbackUrls?: string[];
  signoutUris?: string[];
  scopes?: string[];
  verified?: boolean;
  branding?: AppClientBranding;
}

export interface CreateProviderRequest {
  type: 'google' | 'github' | 'microsoft' | 'facebook' | 'auth0' | 'other';
  clientId: string;
  clientSecret: string;
  /** Scopes for this provider. Use getDefaultScopesForProvider(type) for provider-appropriate defaults (e.g. GitHub: read:user, user:email; Google: openid, email, profile). */
  scopes: string[];
  domain?: string;
  tokenType?: 'apiblaze' | 'thirdParty';
  targetServerToken?: 'apiblaze' | 'third_party_access_token' | 'third_party_id_token' | 'none';
  includeApiblazeAccessTokenHeader?: boolean;
  includeApiblazeIdTokenHeader?: boolean;
}

