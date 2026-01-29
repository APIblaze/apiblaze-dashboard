import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/next-auth';

const ADMIN_API_BASE = process.env.APIBLAZE_ADMIN_API_BASE || 'https://internalapi.apiblaze.com';

/**
 * Resolve apiblazeUserId for the session user (provider identity).
 * Used so JWT sub = apiblazeUserId and project creation stores apiblaze_user_id in config.
 */
async function getApiblazeUserId(
  provider: string,
  providerSub: string,
  email: string | null | undefined,
  displayName: string | null | undefined
): Promise<string> {
  const apiKey = process.env.INTERNAL_API_KEY || process.env.APIBLAZE_ADMIN_API_KEY;
  if (!apiKey) {
    throw new Error('INTERNAL_API_KEY (or APIBLAZE_ADMIN_API_KEY) is not set');
  }
  const res = await fetch(`${ADMIN_API_BASE}/ensure-apiblaze-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify({
      provider,
      provider_sub: providerSub,
      email: email ?? undefined,
      display_name: displayName ?? undefined,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ensure-apiblaze-user failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { apiblazeUserId: string };
  return data.apiblazeUserId;
}

export async function getUserClaims() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new Error('Unauthorized - no session');
  }

  const handle = session.user.githubHandle || session.user.email?.split('@')[0];

  if (!handle || handle === 'anonymous' || handle.length < 2) {
    console.error('Invalid user handle in session:', session.user);
    throw new Error('Invalid user session - missing valid username');
  }

  if (!session.user.email) {
    console.error('No email in session:', session.user);
    throw new Error('Invalid user session - missing email');
  }

  // session.user.id is "github:12345" (NextAuth)
  const rawId = session.user.id ?? `github:${handle}`;
  const providerMatch = rawId.match(/^github:(.+)$/);
  const provider = 'github';
  const providerSub = providerMatch ? providerMatch[1] : rawId;

  const apiblazeUserId = await getApiblazeUserId(
    provider,
    providerSub,
    session.user.email,
    session.user.name ?? undefined
  );

  console.log(`[Auth] Creating JWT for user: ${handle} (${apiblazeUserId})`);

  return {
    sub: apiblazeUserId,
    handle,
    email: session.user.email,
    roles: ['admin'],
  };
}



