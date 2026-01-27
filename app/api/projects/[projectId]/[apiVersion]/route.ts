import { NextRequest, NextResponse } from 'next/server';
import { APIBlazeError, createAPIBlazeClient } from '@/lib/apiblaze-client';
import { getUserClaims } from '../../_utils';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

async function getRouteParams(context: { params: Promise<{ projectId: string; apiVersion: string }> }): Promise<{ projectId: string; apiVersion: string }> {
  const params = await context.params;
  if (typeof params.projectId === 'string' && typeof params.apiVersion === 'string') {
    return { projectId: params.projectId, apiVersion: params.apiVersion };
  }
  throw new Error('Invalid route parameters');
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; apiVersion: string }> }
) {
  const { projectId, apiVersion } = await getRouteParams(context);

  if (!projectId || !apiVersion) {
    return NextResponse.json(
      { error: 'Missing project identifier' },
      { status: 400 }
    );
  }

  try {
    const userClaims = await getUserClaims();
    const body = (await request.json()) as Record<string, unknown>;

    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    await client.updateProxyConfig(userClaims, projectId, apiVersion, body);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error updating project config:', error);

    if (error instanceof APIBlazeError) {
      return NextResponse.json(
        {
          error: error.body?.error || 'Failed to update project config',
          details: error.body?.details ?? error.body?.error,
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
  _request: NextRequest,
  context: { params: Promise<{ projectId: string; apiVersion: string }> }
) {
  const { projectId, apiVersion } = await getRouteParams(context);

  if (!projectId || !apiVersion) {
    return NextResponse.json(
      { error: 'Missing project identifier' },
      { status: 400 }
    );
  }

  try {
    const userClaims = await getUserClaims();

    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    await client.deleteProxy(userClaims, projectId, apiVersion);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error deleting project:', error);

    if (error instanceof APIBlazeError) {
      return NextResponse.json(
        {
          error: error.body?.error || 'Failed to delete project',
          details: error.body?.details ?? error.body?.error,
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

