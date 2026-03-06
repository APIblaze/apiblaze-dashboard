import { NextRequest, NextResponse } from 'next/server';
import { createAPIBlazeClient } from '@/lib/apiblaze-client';
import { getUserClaims } from '../../_utils';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

type RouteParams = { params: Promise<{ projectId: string; apiVersion: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, apiVersion } = await params;
    const userClaims = await getUserClaims();
    const body = await request.json() as Record<string, unknown>;

    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    const data = await client.updateProxyConfig(userClaims, projectId, apiVersion, body);
    return NextResponse.json(data ?? { ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, apiVersion } = await params;
    const userClaims = await getUserClaims();

    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    const data = await client.deleteProxy(userClaims, projectId, apiVersion);
    return NextResponse.json(data ?? { ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
