import { NextRequest, NextResponse } from 'next/server';
import { createAPIBlazeClient } from '@/lib/apiblaze-client';
import { getUserClaims } from '@/app/api/projects/_utils';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; tenantName: string }> }
) {
  try {
    const userClaims = await getUserClaims();
    const { teamId, tenantName } = await params;

    if (!teamId || !tenantName) {
      return NextResponse.json(
        { error: 'Validation error', details: 'teamId and tenantName are required' },
        { status: 400 }
      );
    }

    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    const data = await client.listAppClientsByTenant(userClaims, teamId, tenantName);
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Error fetching app clients by tenant:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized', details: 'Please sign in' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch app clients', details: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; tenantName: string }> }
) {
  try {
    const userClaims = await getUserClaims();
    const { teamId, tenantName } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    if (!teamId || !tenantName) {
      return NextResponse.json(
        { error: 'Validation error', details: 'teamId and tenantName are required' },
        { status: 400 }
      );
    }

    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    const data = await client.createAppClientForTenant(userClaims, teamId, tenantName, body);
    return NextResponse.json(data, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating app client for tenant:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized', details: 'Please sign in' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to create app client', details: message }, { status: 500 });
  }
}
