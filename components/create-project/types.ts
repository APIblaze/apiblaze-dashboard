export type SourceType = 'github' | 'targetUrl' | 'upload';

export type SocialProvider = 'google' | 'facebook' | 'github' | 'microsoft' | 'auth0' | 'other';

export type QuotaInterval = 'day' | 'week' | 'month';

export interface TargetServerConfig {
  type: 'header' | 'parameter' | 'bodyVar';
  name: string;
  value: string;
}

export interface TargetServer {
  stage: string;
  targetUrl: string;
  config: TargetServerConfig[];
}

export interface CustomDomain {
  domain: string;
  verified: boolean;
}

export interface ProjectConfig {
  // General
  projectName: string;
  apiVersion: string;
  sourceType: SourceType;
  githubUser: string;
  githubRepo: string;
  githubPath: string;
  githubBranch: string;
  targetUrl: string;
  uploadedFile: File | null;
  
  // Authentication
  userGroupName: string;
  enableSocialAuth: boolean;
  // Requests Authentication (how each proxy request is authenticated)
  requestsAuthMode: 'authenticate' | 'passthrough';
  requestsAuthMethods: ('jwt' | 'opaque' | 'api_key')[];
  allowedIssuers: string[];
  allowedAudiences: string[];
  opaqueTokenEndpoint: string;
  opaqueTokenMethod: 'GET' | 'POST';
  opaqueTokenParams: string;
  opaqueTokenBody: string;
  useAuthConfig: boolean;
  authConfigId?: string;
  appClientId?: string;
  defaultAppClient?: string; // ID of the default app client for this project
  // Legacy OAuth fields (deprecated, use AuthConfig instead)
  bringOwnProvider: boolean;
  socialProvider: SocialProvider;
  identityProviderDomain: string;
  identityProviderClientId: string;
  identityProviderClientSecret: string;
  authorizedScopes: string[];
  authorizedCallbackUrls?: string[]; // Authorized callback URLs for AppClient
  tokenType?: 'apiblaze' | 'thirdParty';
  targetServerToken?: 'apiblaze' | 'third_party_access_token' | 'third_party_id_token' | 'none';
  includeApiblazeAccessTokenHeader?: boolean;
  includeApiblazeIdTokenHeader?: boolean;
  // Multiple providers for create mode (when bringOwnProvider is true)
  providers?: Array<{
    type: SocialProvider;
    domain: string;
    clientId: string;
    clientSecret: string;
  }>;
  
  // Target Servers
  targetServers: TargetServer[];
  
  // Portal
  createPortal: boolean;
  portalLogoUrl: string;
  
  // Throttling (new structure)
  throttling?: {
    // Per-user rate limiting (req/sec)
    userRateLimit: number;        // e.g., 10 req/sec per user
    // userBurst: number;         // COMMENTED OUT - not using bucket model
    
    // Per-proxy daily quota (always per day)
    proxyDailyQuota: number;      // e.g., 1000 requests per day
    
    // Per-account monthly quota
    accountMonthlyQuota: number;  // e.g., 100000 requests per month
  };
  
  // Pre/Post Processing
  preProcessingPath: string;
  postProcessingPath: string;
  
  // Domains
  customDomains: CustomDomain[];
}

