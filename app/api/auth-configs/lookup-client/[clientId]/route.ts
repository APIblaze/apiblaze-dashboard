import { NextRequest, NextResponse } from 'next/server';
import { createAPIBlazeClient } from '@/lib/apiblaze-client';
import { getUserClaims } from '../../../projects/_utils';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const userClaims = await getUserClaims();
    const { clientId } = await params;

    if (!clientId) {
      return NextResponse.json(
        { error: 'client_id required' },
        { status: 400 }
      );
    }

    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    const data = await client.lookupAppClient(userClaims, clientId);
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Error looking up app client:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Please sign in' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to lookup app client', details: message },
      { status: 500 }
    );
  }
}
