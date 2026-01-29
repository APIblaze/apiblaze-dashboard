import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/next-auth';

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

  // Use only stable id for ownership; never email (mutable, not unique)
  const userId = session.user.id ?? `github:${handle}`;

  console.log(`[Auth] Creating JWT for user: ${handle} (${userId})`);

  return {
    sub: userId,
    handle,
    email: session.user.email,
    roles: ['admin'],
  };
}



