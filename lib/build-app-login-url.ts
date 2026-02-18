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
 */
export function buildAppLoginAuthorizeUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[]
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
  return `${path}?${params.toString()}`;
}

/**
 * Generate a PKCE code_verifier (43-128 chars, base64url).
 */
function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  }
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Compute S256 code_challenge from code_verifier (browser-safe).
 */
async function computeCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const base64 = btoa(String.fromCharCode(...hashArray));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Append an example code_challenge to the authorize URL so the link can be opened directly.
 * The token exchange will still require the matching code_verifier (which we do not expose);
 * this is only so the login page loads without error. For a real flow, the app must generate
 * its own code_verifier/code_challenge.
 */
export async function addPkceToAuthorizeUrl(baseUrl: string): Promise<string> {
  const verifier = generateCodeVerifier();
  const challenge = await computeCodeChallenge(verifier);
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256`;
}
