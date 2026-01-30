import { NextRequest, NextResponse } from 'next/server';
import { APIBlazeError, createAPIBlazeClient } from '@/lib/apiblaze-client';
import { getUserClaims } from '../_utils';

export async function GET(request: NextRequest) {
  try {
    const userClaims = await getUserClaims();
    const searchParams = request.nextUrl.searchParams;
    const projectName = searchParams.get('projectName') ?? '';
    const apiVersion = searchParams.get('apiVersion') ?? '1.0.0';

    if (!projectName.trim()) {
      return NextResponse.json(
        { error: 'projectName query parameter required' },
        { status: 400 }
      );
    }

    const client = createAPIBlazeClient({
      apiKey: process.env.INTERNAL_API_KEY || '',
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    const data = await client.checkProjectName(userClaims, projectName.trim(), apiVersion.trim());
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Error checking project name:', error);

    if (error instanceof APIBlazeError) {
      return NextResponse.json(
        {
          error: error.body?.error || 'Failed to check project name',
          details: error.body?.details ?? error.body?.error,
        },
        { status: error.status }
      );
    }

    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('Unauthorized') || message.includes('no session')) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Please sign in' },
        { status: 401 }
      );
    }

    if (message.includes('User has no team')) {
      return NextResponse.json(
        { error: 'User has no team', details: message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to check project name', details: message },
      { status: 500 }
    );
  }
}
