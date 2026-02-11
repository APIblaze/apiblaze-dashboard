import { NextRequest, NextResponse } from 'next/server';
import { APIBlazeError, createAPIBlazeClient } from '@/lib/apiblaze-client';
import { getUserClaims } from '../../../../../projects/_utils';
import type { CreateProviderRequest } from '@/types/auth-config';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ authConfigId: string; clientId: string }> }
) {
  try {
    const userClaims = await getUserClaims();
    const { authConfigId, clientId } = await params;
    
    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    const data = await client.listProviders(userClaims, authConfigId, clientId);
    return NextResponse.json(data);
    
  } catch (error: unknown) {
    console.error('Error fetching providers:', error);
    
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Please sign in' },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch providers', details: message },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ authConfigId: string; clientId: string }> }
) {
  try {
    const userClaims = await getUserClaims();
    const { authConfigId, clientId } = await params;
    const body = (await request.json()) as CreateProviderRequest;
    
    if (!body.type || !body.clientId || !body.clientSecret) {
      return NextResponse.json(
        { error: 'Validation error', details: 'Provider type, clientId, and clientSecret are required' },
        { status: 400 }
      );
    }
    
    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });
    
    console.log('[providers POST] tokenType received:', body.tokenType);
    const data = await client.addProvider(userClaims, authConfigId, clientId, {
      type: body.type,
      clientId: body.clientId,
      clientSecret: body.clientSecret,
      domain: body.domain,
      tokenType: body.tokenType,
      targetServerToken: body.targetServerToken,
      includeApiblazeAccessTokenHeader: body.includeApiblazeAccessTokenHeader,
      includeApiblazeIdTokenHeader: body.includeApiblazeIdTokenHeader,
    });
    return NextResponse.json(data);
    
  } catch (error: unknown) {
    console.error('Error adding provider:', error);
    
    if (error instanceof APIBlazeError) {
      return NextResponse.json(
        {
          error: error.body?.error || 'Failed to add provider',
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
      { error: 'Failed to add provider', details: message },
      { status: 500 }
    );
  }
}

