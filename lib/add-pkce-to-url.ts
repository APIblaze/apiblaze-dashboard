'use server';

import { createHash, randomBytes } from 'crypto';

/**
 * Generate a PKCE code_verifier (43-128 chars, base64url).
 */
function generateCodeVerifier(): string {
  const bytes = randomBytes(32);
  return bytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Compute S256 code_challenge from code_verifier.
 * Uses Node's crypto (server-only).
 */
function computeCodeChallenge(verifier: string): string {
  const hash = createHash('sha256').update(verifier).digest();
  return Buffer.from(hash)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Append an example code_challenge to the authorize URL.
 * Server Action - runs only on server, uses Node crypto.
 */
export async function addPkceToAuthorizeUrl(baseUrl: string): Promise<string> {
  const verifier = generateCodeVerifier();
  const challenge = computeCodeChallenge(verifier);
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256`;
}
