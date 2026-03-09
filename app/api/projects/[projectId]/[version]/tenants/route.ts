import { NextRequest, NextResponse } from 'next/server';
import { createAPIBlazeClient } from '@/lib/apiblaze-client';
import { getUserClaims } from '@/app/api/projects/_utils';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; version: string }> }
) {
  try {
    const userClaims = await getUserClaims();
    const { projectId, version } = await params;

    if (!projectId || !version) {
      return NextResponse.json(
        { error: 'Validation error', details: 'projectId and version are required' },
        { status: 400 }
      );
    }

    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    const data = await client.listProjectTenants(userClaims, projectId, version);
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Error listing project tenants:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Please sign in' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to list tenants', details: message },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; version: string }> }
) {
  try {
    const userClaims = await getUserClaims();
    const { projectId, version } = await params;

    if (!projectId || !version) {
      return NextResponse.json(
        { error: 'Validation error', details: 'projectId and version are required' },
        { status: 400 }
      );
    }

    const body = await request.json() as { tenant_name: string; display_name?: string; auth_config_id?: string };

    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    const data = await client.attachTenantToProject(userClaims, projectId, version, body);
    return NextResponse.json(data, { status: 201 });
  } catch (error: unknown) {
    console.error('Error attaching tenant:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Please sign in' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to attach tenant', details: message },
      { status: 500 }
    );
  }
}
