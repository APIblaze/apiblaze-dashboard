/**
 * Default OAuth scopes per provider type for dashboard forms.
 * Matches auth-worker provider-default-scopes (GitHub uses read:user/user:email; OIDC uses openid email profile).
 */

export const PROVIDER_DEFAULT_SCOPES: Record<string, string[]> = {
  google: ['openid', 'email', 'profile'],
  github: ['read:user', 'user:email'],
  microsoft: ['openid', 'email', 'profile'],
  facebook: ['email', 'public_profile'],
  auth0: ['openid', 'email', 'profile'],
  other: ['openid', 'email', 'profile'],
};

export type ProviderType = keyof typeof PROVIDER_DEFAULT_SCOPES;

/**
 * Default scopes for a provider type (array for form inputs).
 * Falls back to openid, email, profile for unknown types.
 */
export function getDefaultScopesForProvider(providerType: string): string[] {
  const key = (providerType || '').toLowerCase().trim() as ProviderType;
  return PROVIDER_DEFAULT_SCOPES[key] ?? ['openid', 'email', 'profile'];
}
