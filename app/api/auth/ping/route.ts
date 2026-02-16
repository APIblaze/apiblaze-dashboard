import { NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import { RequestError } from '@octokit/request-error';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/next-auth';

/**
 * Lightweight authenticated ping to validate GitHub credentials.
 * Returns 200 if token is valid, 401 if expired/revoked.
 * Used by AuthPing component for periodic credential validation.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const octokit = new Octokit({
      auth: session.accessToken,
      request: { timeout: 5000 },
    });

    await octokit.users.getAuthenticated();
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    if (error instanceof RequestError && error.status === 401) {
      return NextResponse.json(
        { error: 'Invalid or expired GitHub token' },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: 'Ping failed' },
      { status: 500 }
    );
  }
}
