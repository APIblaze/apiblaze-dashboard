import { NextRequest, NextResponse } from 'next/server';
import { APIBlazeError, createAPIBlazeClient } from '@/lib/apiblaze-client';
import { getUserClaims } from '../../../projects/_utils';
import type { CreateAppClientRequest } from '@/types/auth-config';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ authConfigId: string }> }
) {
  try {
    const userClaims = await getUserClaims();
    const { authConfigId } = await params;
    
    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    const data = await client.listAppClients(userClaims, authConfigId);
    return NextResponse.json(data);
    
  } catch (error: unknown) {
    console.error('Error fetching app clients:', error);
    
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Please sign in' },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch app clients', details: message },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ authConfigId: string }> }
) {
  try {
    const userClaims = await getUserClaims();
    const { authConfigId } = await params;
    const body = (await request.json()) as CreateAppClientRequest;
    
    if (!body.name || body.name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Validation error', details: 'AppClient name is required' },
        { status: 400 }
      );
    }
    
    // Set safe defaults for token expiries
    const appClientData = {
      name: body.name,
      refreshTokenExpiry: body.refreshTokenExpiry ?? 2592000, // 30 days
      idTokenExpiry: body.idTokenExpiry ?? 3600, // 1 hour
      accessTokenExpiry: body.accessTokenExpiry ?? 3600, // 1 hour
      redirectUris: body.redirectUris ?? [],
      signoutUris: body.signoutUris ?? [],
      scopes: body.scopes ?? ['email', 'openid', 'profile'],
    };
    
    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });
    
    const data = await client.createAppClient(userClaims, authConfigId, appClientData);
    return NextResponse.json(data);
    
  } catch (error: unknown) {
    console.error('Error creating app client:', error);
    
    if (error instanceof APIBlazeError) {
      return NextResponse.json(
        {
          error: error.body?.error || 'Failed to create app client',
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
      { error: 'Failed to create app client', details: message },
      { status: 500 }
    );
  }
}

