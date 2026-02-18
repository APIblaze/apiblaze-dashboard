import { NextRequest, NextResponse } from 'next/server';
import { APIBlazeError, createAPIBlazeClient } from '@/lib/apiblaze-client';
import { getUserClaims } from '../../../../../../projects/_utils';
import type { CreateProviderRequest } from '@/types/auth-config';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ authConfigId: string; clientId: string; providerId: string }> }
) {
  try {
    const userClaims = await getUserClaims();
    const { authConfigId, clientId, providerId } = await params;
    const body = (await request.json()) as CreateProviderRequest;

    if (!body.type || !body.clientId || !body.clientSecret) {
      return NextResponse.json(
        { error: 'Validation error', details: 'Provider type, clientId, and clientSecret are required' },
        { status: 400 }
      );
    }
    if (!body.authorizedScopes || !Array.isArray(body.authorizedScopes) || body.authorizedScopes.length === 0) {
      return NextResponse.json(
        { error: 'Validation error', details: 'authorizedScopes (non-empty array) is required' },
        { status: 400 }
      );
    }

    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    const data = await client.updateProvider(userClaims, authConfigId, clientId, providerId, {
      type: body.type,
      clientId: body.clientId,
      clientSecret: body.clientSecret,
      authorizedScopes: body.authorizedScopes,
      domain: body.domain,
      tokenType: body.tokenType,
      targetServerToken: body.targetServerToken,
      includeApiblazeAccessTokenHeader: body.includeApiblazeAccessTokenHeader,
      includeApiblazeIdTokenHeader: body.includeApiblazeIdTokenHeader,
    });
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Error updating provider:', error);

    if (error instanceof APIBlazeError) {
      return NextResponse.json(
        {
          error: error.body?.error || 'Failed to update provider',
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
      { error: 'Failed to update provider', details: message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ authConfigId: string; clientId: string; providerId: string }> }
) {
  let authConfigId: string | undefined;
  let clientId: string | undefined;
  let providerId: string | undefined;
  
  try {
    const userClaims = await getUserClaims();
    const resolvedParams = await params;
    authConfigId = resolvedParams.authConfigId;
    clientId = resolvedParams.clientId;
    providerId = resolvedParams.providerId;
    
    console.log('DELETE provider request:', {
      authConfigId,
      clientId,
      providerId,
      providerIdLength: providerId?.length,
    });
    
    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });
    
    await client.removeProvider(userClaims, authConfigId, clientId, providerId);
    // Return 204 No Content - DELETE operations should not have a response body
    return new NextResponse(null, { status: 204 });
    
  } catch (error: unknown) {
    console.error('Error removing provider:', error);
    
    if (error instanceof APIBlazeError) {
      console.error('APIBlazeError details:', {
        status: error.status,
        body: error.body,
        message: error.message,
        authConfigId,
        clientId,
        providerId,
      });
      
      return NextResponse.json(
        {
          error: error.body?.error || 'Failed to remove provider',
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
      { error: 'Failed to remove provider', details: message },
      { status: 500 }
    );
  }
}

