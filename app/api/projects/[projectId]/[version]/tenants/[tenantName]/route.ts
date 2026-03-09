import { NextRequest, NextResponse } from 'next/server';
import { createAPIBlazeClient } from '@/lib/apiblaze-client';
import { getUserClaims } from '@/app/api/projects/_utils';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

export async function DELETE(
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

    await client.detachTenantFromProject(userClaims, projectId, version, tenantName);
    return new NextResponse(null, { status: 204 });
  } catch (error: unknown) {
    console.error('Error detaching tenant:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Please sign in' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to detach tenant', details: message },
      { status: 500 }
    );
  }
}
