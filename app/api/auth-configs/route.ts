import { NextRequest, NextResponse } from 'next/server';
import { APIBlazeError, createAPIBlazeClient } from '@/lib/apiblaze-client';
import { getUserClaims } from '../projects/_utils';
import type { CreateAuthConfigRequest, AuthConfig } from '@/types/auth-config';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

export async function GET(request: NextRequest) {
  try {
    const userClaims = await getUserClaims();
    
    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    const data = await client.listAuthConfigs(userClaims);
    return NextResponse.json(data);
    
  } catch (error: unknown) {
    console.error('Error fetching auth configs:', error);
    
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Please sign in' },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch auth configs', details: message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userClaims = await getUserClaims();
    const body = (await request.json()) as CreateAuthConfigRequest;
    
    if (!body.name || body.name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Validation error', details: 'AuthConfig name is required' },
        { status: 400 }
      );
    }
    
    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });
    
    const data = await client.createAuthConfig(userClaims, body);
    return NextResponse.json(data);
    
  } catch (error: unknown) {
    console.error('Error creating auth config:', error);
    
    if (error instanceof APIBlazeError) {
      return NextResponse.json(
        {
          error: error.body?.error || 'Failed to create auth config',
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
      { error: 'Failed to create auth config', details: message },
      { status: 500 }
    );
  }
}

