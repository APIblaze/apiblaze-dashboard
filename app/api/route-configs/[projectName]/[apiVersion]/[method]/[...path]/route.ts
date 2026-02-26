import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/next-auth';

// ─── ROUTE CONFIG STORAGE DECISION ───────────────────────────────────────────
// Proxies to policies-api (*.policies.apiblaze.com/route/*).
// See sibling route.ts for full explanation and revert instructions.
//
// TO REVERT to admin-api: replace PUT/DELETE fetch calls with APIBlazeClient
// PUT /route-configs/:projectName/:apiVersion/:encodedPath/:method and DELETE equivalent.
// Remove mapToPoliciesFormat() — the admin-api schema matches RouteEntry directly.
// ─────────────────────────────────────────────────────────────────────────────

const POLICIES_API_DOMAIN = process.env.POLICIES_API_DOMAIN || 'policies.apiblaze.com';

// Map the dashboard RouteEntry schema to the policies-api request body.
// Dashboard stores pre/post templates as single JSON strings; policies-api
// expects arrays of OpenFGA check objects — we parse and wrap in [].
function mapToPoliciesFormat(entry: {
  require_authentication?: boolean;
  pre_request_auth_template?: string;
  post_response_policy_template?: string;
  cache_rules?: string;
}) {
  function parseTemplate(s?: string): object[] | undefined {
    if (!s?.trim()) return undefined;
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return undefined;
    }
  }

  function parseConfig(s?: string): object | null {
    if (!s?.trim()) return null;
    try { return JSON.parse(s); } catch { return null; }
  }

  return {
    on_request_read: parseTemplate(entry.pre_request_auth_template),
    post_response_write: parseTemplate(entry.post_response_policy_template),
    authentication_config: { require_authentication: entry.require_authentication ?? true },
    cache_config: parseConfig(entry.cache_rules),
  };
}

type Params = { projectName: string; apiVersion: string; method: string; path: string[] };

// Reconstruct the API route path from the [...path] catch-all segments.
// e.g. params.path = ['api', 'v1', 'users', '{id}'] → '/api/v1/users/{id}'
// Encode { and } for the URL but keep slashes natural.
function buildPoliciesUrl(projectName: string, apiVersion: string, method: string, pathSegments: string[]): string {
  const routePath = '/' + pathSegments.join('/');
  const encodedPath = routePath.replace(/\{/g, '%7B').replace(/\}/g, '%7D');
  return `https://${projectName}.${POLICIES_API_DOMAIN}/route/${encodeURIComponent(method)}${encodedPath}?api_version=${encodeURIComponent(apiVersion)}`;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectName, apiVersion, method, path: pathSegments } = await params;
    if (!/^[a-z0-9]+$/.test(projectName)) {
      return NextResponse.json({ error: 'Invalid project name' }, { status: 400 });
    }
    const routePath = '/' + pathSegments.join('/');
    const body = await request.json() as Record<string, unknown>;
    const policiesBody = mapToPoliciesFormat(body as Parameters<typeof mapToPoliciesFormat>[0]);

    const putUrl = buildPoliciesUrl(projectName, apiVersion, method, pathSegments);

    // Try PUT first (update existing route).
    // On 404 the route doesn't exist yet — fall back to POST /route to create it.
    let res = await fetch(putUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...policiesBody, resource: routePath }),
    });

    if (res.status === 404) {
      const postUrl = `https://${projectName}.${POLICIES_API_DOMAIN}/route?api_version=${encodeURIComponent(apiVersion)}`;
      res = await fetch(postUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: method.toUpperCase(), resource: routePath, ...policiesBody }),
      });
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      return NextResponse.json({ error: err.error || 'Failed to save route config' }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status === 201 ? 201 : 200 });
  } catch (error) {
    console.error('[route-configs PUT]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectName, apiVersion, method, path: pathSegments } = await params;
    if (!/^[a-z0-9]+$/.test(projectName)) {
      return NextResponse.json({ error: 'Invalid project name' }, { status: 400 });
    }
    const url = buildPoliciesUrl(projectName, apiVersion, method, pathSegments);

    const res = await fetch(url, { method: 'DELETE' });

    if (!res.ok && res.status !== 404) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      return NextResponse.json({ error: err.error || 'Failed to delete route config' }, { status: res.status });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[route-configs DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
