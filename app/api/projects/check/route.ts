import { NextRequest, NextResponse } from 'next/server';
import { APIBlazeError, createAPIBlazeClient } from '@/lib/apiblaze-client';
import { getUserClaims } from '../_utils';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

export async function GET(request: NextRequest) {
  try {
    const userClaims = await getUserClaims();
    const searchParams = request.nextUrl.searchParams;
    const name = searchParams.get('name') || undefined;
    const subdomain = searchParams.get('subdomain') || undefined;
    const apiVersion = searchParams.get('api_version') || undefined;
    
    if (!name && !subdomain) {
      return NextResponse.json(
        { error: 'name or subdomain query parameter required' },
        { status: 400 }
      );
    }
    
    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });
    
    const data = await client.checkProjectExists(userClaims, name, subdomain, apiVersion);
    return NextResponse.json(data);
    
  } catch (error: unknown) {
    console.error('Error checking project existence:', error);
    
    if (error instanceof APIBlazeError) {
      return NextResponse.json(
        {
          error: error.body?.error || 'Failed to check project existence',
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
      { error: 'Failed to check project existence', details: message },
      { status: 500 }
    );
  }
}

