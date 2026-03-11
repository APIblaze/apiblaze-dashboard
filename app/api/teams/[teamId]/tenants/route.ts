import { NextRequest, NextResponse } from 'next/server';
import { createAPIBlazeClient, APIBlazeError } from '@/lib/apiblaze-client';
import { getUserClaims } from '@/app/api/projects/_utils';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

function sanitizeErrorDetails(raw: unknown): string {
  if (raw == null) {
    return 'An internal error occurred';
  }

  const text = String(raw);

  // Heuristic: if it looks like HTML, JSON, a stack trace, or a long log blob, replace with generic message
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(text);
  const looksLikeJson = /^[\s]*[{[][\s\S]*[}\]][\s]*$/.test(text);
  const looksLikeStack =
    /at\s+\S+\s+\(.*\)/.test(text) ||
    /Error[:\s]/i.test(text) ||
    /stack trace/i.test(text);

  if (looksLikeHtml || looksLikeJson || looksLikeStack) {
    return 'An internal error occurred';
  }

  // Normalize whitespace and limit length
  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (!singleLine) {
    return 'An internal error occurred';
  }

  const maxLen = 200;
  return singleLine.length > maxLen ? `${singleLine.slice(0, maxLen)}…` : singleLine;
}

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

    const detail = request.nextUrl.searchParams.get('detail') === '1';
    const data = await client.getTeamTenants(userClaims, teamId, detail);
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

export async function POST(
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

    const body = await request.json() as { display_name: string; tenant_name?: string };

    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    const data = await client.createTeamTenant(userClaims, teamId, body);
    return NextResponse.json(data, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating tenant:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    const rawDetails =
      error instanceof APIBlazeError
        ? error.body?.details ?? error.body?.error ?? message
        : message;
    const sanitizedDetails = sanitizeErrorDetails(rawDetails);

    if (message.includes('Unauthorized') || sanitizedDetails.includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Please sign in' },
        { status: 401 }
      );
    }

    const status = error instanceof APIBlazeError ? error.status : 500;
    console.error('Upstream create tenant error details:', rawDetails);
    return NextResponse.json(
      {
        error: 'Failed to create tenant',
        details: sanitizedDetails,
      },
      { status: status >= 400 ? status : 500 }
    );
  }
}
