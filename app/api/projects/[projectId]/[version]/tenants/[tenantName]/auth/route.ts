import { NextRequest, NextResponse } from 'next/server';
import { createAPIBlazeClient, APIBlazeError } from '@/lib/apiblaze-client';
import { getUserClaims } from '@/app/api/projects/_utils';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; version: string; tenantName: string }> }
) {
  try {
    const userClaims = await getUserClaims();
    const { projectId, version, tenantName } = await params;

    if (!projectId || !version || !tenantName) {
      return NextResponse.json(
        { error: 'Validation error', details: 'projectId, version, and tenantName are required' },
        { status: 400 }
      );
    }

    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    const data = await client.getTenantAuthConfig(userClaims, projectId, version, tenantName);
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Error getting tenant auth config:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    const details = error instanceof APIBlazeError
      ? (error.body.details ?? error.body.error ?? message)
      : message;

    if (message.includes('Unauthorized') || String(details).includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Please sign in' },
        { status: 401 }
      );
    }

    const status = error instanceof APIBlazeError ? error.status : 500;
    return NextResponse.json(
      { error: 'Failed to get tenant auth config', details },
      { status: status >= 400 ? status : 500 }
    );
  }
}
