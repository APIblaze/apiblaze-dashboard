/**
 * Build the OAuth /authorize login URL for "Your App login" when the app client
 * has an authorized callback URL that is not apiblaze.com or abz.run (i.e. the app's own URL).
 */

const AUTH_ISSUER = process.env.NEXT_PUBLIC_AUTH_ISSUER ?? 'https://auth.apiblaze.com';

/**
 * Returns the first authorized callback URL that does not contain apiblaze.com or abz.run.
 */
export function getFirstExternalCallbackUrl(authorizedCallbackUrls: string[] | undefined): string | null {
  if (!Array.isArray(authorizedCallbackUrls) || authorizedCallbackUrls.length === 0) return null;
  const external = authorizedCallbackUrls.find(
    (url) =>
      typeof url === 'string' &&
      !url.includes('apiblaze.com') &&
      !url.includes('abz.run')
  );
  return external ?? null;
}

/**
 * Builds the /authorize URL with response_type=code, client_id, redirect_uri, and scope.
 * The app must add state, code_challenge, and code_challenge_method=S256 (PKCE) for each request.
 * When providerType is set (e.g. first provider for this app client), adds &provider= so auth redirects to that provider.
 */
export function buildAppLoginAuthorizeUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  providerType?: string
): string {
  const base = AUTH_ISSUER.replace(/\/$/, '');
  const path = base.includes('/authorize') ? base : `${base}/authorize`;
  const scopeStr = Array.isArray(scopes) && scopes.length > 0
    ? scopes.filter(Boolean).join(' ')
    : 'openid';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopeStr,
  });
  if (providerType && providerType.trim()) {
    params.set('provider', providerType.trim());
  }
  return `${path}?${params.toString()}`;
}

/**
 * addPkceToAuthorizeUrl is a Server Action - import from '@/lib/add-pkce-to-url'.
 * It uses Node's crypto and runs only on the server.
 */
