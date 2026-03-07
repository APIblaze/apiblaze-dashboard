import { NextRequest, NextResponse } from 'next/server';
import { APIBlazeError, createAPIBlazeClient } from '@/lib/apiblaze-client';
import { getUserClaims } from '@/app/api/projects/_utils';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; tenantName: string; clientId: string; providerId: string }> }
) {
  try {
    const userClaims = await getUserClaims();
    const { teamId, tenantName, clientId, providerId } = await params;

    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    const data = await client.getProviderSecretByTenant(userClaims, teamId, tenantName, clientId, providerId);
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Error fetching provider secret by tenant:', error);
    if (error instanceof APIBlazeError) {
      return NextResponse.json(
        { error: error.body?.error || 'Failed to reveal provider secret', details: error.body?.details ?? error.body?.error },
        { status: error.status }
      );
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized', details: 'Please sign in' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to reveal provider secret', details: message }, { status: 500 });
  }
}
