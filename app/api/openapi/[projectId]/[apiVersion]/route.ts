import { NextRequest, NextResponse } from 'next/server';

type RouteParams = {
  projectId: string;
  apiVersion: string;
};

function getParams(context: unknown): RouteParams {
  if (
    typeof context === 'object' &&
    context !== null &&
    'params' in context &&
    typeof (context as { params?: unknown }).params === 'object' &&
    (context as { params: unknown }).params !== null
  ) {
    const { projectId, apiVersion } = (context as {
      params: Record<string, unknown>;
    }).params;

    if (typeof projectId === 'string' && typeof apiVersion === 'string') {
      return { projectId, apiVersion };
    }
  }

  throw new Error('Invalid route parameters');
}

export async function GET(request: NextRequest, context: unknown) {
  const { projectId, apiVersion } = getParams(context);
  const environment = request.nextUrl.searchParams.get('environment') ?? 'prod';

  try {
    const upstreamUrl = new URL(
      `https://${projectId}.apiblaze.com/${apiVersion}/openapi.json`
    );

    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      headers: {
        accept: 'application/json, application/yaml;q=0.9',
      },
    });

    if (!upstreamResponse.ok) {
      const body = await upstreamResponse.text();
      return NextResponse.json(
        {
          error: 'upstream_openapi_error',
          details: body || upstreamResponse.statusText,
        },
        { status: upstreamResponse.status }
      );
    }

    const contentType = upstreamResponse.headers.get('content-type') ?? 'application/json';
    let spec: unknown;

    if (contentType.includes('yaml')) {
      await upstreamResponse.text();
      return NextResponse.json(
        {
          error: 'unsupported_format',
          details: 'YAML OpenAPI specs are not yet supported by this endpoint.',
        },
        { status: 415 }
      );
    } else {
      spec = await upstreamResponse.json();
    }

    return NextResponse.json(
      {
        spec,
        projectId,
        apiVersion,
        environment,
        fetchedAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error: unknown) {
    console.error('Failed to fetch OpenAPI spec:', error);
    return NextResponse.json(
      {
        error: 'openapi_fetch_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

