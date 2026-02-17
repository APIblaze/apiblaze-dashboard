import { NextRequest, NextResponse } from 'next/server';
import { createAPIBlazeClient } from '@/lib/apiblaze-client';
import { getUserClaims } from '@/app/api/projects/_utils';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; apiVersion: string }> }
) {
  try {
    const { projectId, apiVersion } = await context.params;
    const userClaims = await getUserClaims();

    const client = createAPIBlazeClient({
      apiKey: process.env.INTERNAL_API_KEY || process.env.APIBLAZE_ADMIN_API_KEY || '',
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    const data = await client.request<{ routes?: unknown[] }>(
      `/route-configs/${encodeURIComponent(projectId)}/${encodeURIComponent(apiVersion)}`,
      { method: 'GET', userClaims }
    );

    return NextResponse.json(data ?? { routes: [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Please sign in' },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to fetch route config', details: message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; apiVersion: string }> }
) {
  try {
    const { projectId, apiVersion } = await context.params;
    const userClaims = await getUserClaims();

    const client = createAPIBlazeClient({
      apiKey: process.env.INTERNAL_API_KEY || process.env.APIBLAZE_ADMIN_API_KEY || '',
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    await client.request(
      `/route-configs/${encodeURIComponent(projectId)}/${encodeURIComponent(apiVersion)}`,
      { method: 'DELETE', userClaims }
    );

    return new NextResponse(null, { status: 204 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Please sign in' },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to delete route config', details: message },
      { status: 500 }
    );
  }
}
