import { NextRequest, NextResponse } from 'next/server';
import { createAPIBlazeClient } from '@/lib/apiblaze-client';
import { getUserClaims } from '@/app/api/projects/_utils';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; tenantName: string; clientId: string }> }
) {
  try {
    const userClaims = await getUserClaims();
    const { teamId, tenantName, clientId } = await params;

    if (!teamId || !tenantName || !clientId) {
      return NextResponse.json(
        { error: 'Validation error', details: 'teamId, tenantName, and clientId are required' },
        { status: 400 }
      );
    }

    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    const data = await client.getAppClientByTenant(userClaims, teamId, tenantName, clientId);
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Error fetching app client by tenant:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized', details: 'Please sign in' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch app client', details: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; tenantName: string; clientId: string }> }
) {
  try {
    const userClaims = await getUserClaims();
    const { teamId, tenantName, clientId } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    if (!teamId || !tenantName || !clientId) {
      return NextResponse.json(
        { error: 'Validation error', details: 'teamId, tenantName, and clientId are required' },
        { status: 400 }
      );
    }

    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    const data = await client.updateAppClientByTenant(userClaims, teamId, tenantName, clientId, body);
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Error updating app client by tenant:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized', details: 'Please sign in' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to update app client', details: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; tenantName: string; clientId: string }> }
) {
  try {
    const userClaims = await getUserClaims();
    const { teamId, tenantName, clientId } = await params;

    if (!teamId || !tenantName || !clientId) {
      return NextResponse.json(
        { error: 'Validation error', details: 'teamId, tenantName, and clientId are required' },
        { status: 400 }
      );
    }

    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    await client.deleteAppClientByTenant(userClaims, teamId, tenantName, clientId);
    return new NextResponse(null, { status: 204 });
  } catch (error: unknown) {
    console.error('Error deleting app client by tenant:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized', details: 'Please sign in' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to delete app client', details: message }, { status: 500 });
  }
}
