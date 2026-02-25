import { NextRequest, NextResponse } from 'next/server';
import { createAPIBlazeClient } from '@/lib/apiblaze-client';
import { getUserClaims } from '@/app/api/projects/_utils';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const userClaims = await getUserClaims();
    const { teamId } = await params;

    if (!teamId) {
      return NextResponse.json(
        { error: 'Validation error', details: 'teamId is required' },
        { status: 400 }
      );
    }

    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    const data = await client.getTeamTenants(userClaims, teamId);
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Error fetching team tenants:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Please sign in' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch tenants', details: message },
      { status: 500 }
    );
  }
}
