import { NextRequest, NextResponse } from 'next/server';
import { APIBlazeError, createAPIBlazeClient } from '@/lib/apiblaze-client';
import { getUserClaims } from '@/app/api/projects/_utils';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || process.env.APIBLAZE_ADMIN_API_KEY;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; version: string }> }
) {
  try {
    const userClaims = await getUserClaims();
    const { projectId, version } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    if (!projectId || !version) {
      return NextResponse.json(
        { error: 'Validation error', details: 'projectId and version are required' },
        { status: 400 }
      );
    }

    if (!INTERNAL_API_KEY) {
      return NextResponse.json(
        { error: 'Server configuration error', details: 'INTERNAL_API_KEY not configured' },
        { status: 500 }
      );
    }

    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    await client.updateProxyConfig(userClaims, projectId, version, body);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error updating project config:', error);

    if (error instanceof APIBlazeError) {
      return NextResponse.json(
        {
          error: error.body?.error || 'Failed to update project config',
          details: error.body?.details ?? error.body?.error,
          suggestions: error.body?.suggestions,
        },
        { status: error.status }
      );
    }

    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Please sign in' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update project config', details: message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; version: string }> }
) {
  try {
    const userClaims = await getUserClaims();
    const { projectId, version } = await params;

    if (!projectId || !version) {
      return NextResponse.json(
        { error: 'Validation error', details: 'projectId and version are required' },
        { status: 400 }
      );
    }

    if (!INTERNAL_API_KEY) {
      return NextResponse.json(
        { error: 'Server configuration error', details: 'INTERNAL_API_KEY not configured' },
        { status: 500 }
      );
    }

    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    await client.deleteProxy(userClaims, projectId, version);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error deleting project:', error);

    if (error instanceof APIBlazeError) {
      return NextResponse.json(
        {
          error: error.body?.error || 'Failed to delete project',
          details: error.body?.details ?? error.body?.error,
          suggestions: error.body?.suggestions,
        },
        { status: error.status }
      );
    }

    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Please sign in' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to delete project', details: message },
      { status: 500 }
    );
  }
}
