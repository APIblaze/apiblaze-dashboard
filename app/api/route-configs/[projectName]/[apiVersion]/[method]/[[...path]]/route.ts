import { NextRequest, NextResponse } from 'next/server';
import { createAPIBlazeClient } from '@/lib/apiblaze-client';
import { getUserClaims } from '@/app/api/projects/_utils';

// ─── ROUTE CONFIG STORAGE DECISION ───────────────────────────────────────────
// Proxies to policies-api (*.policies.apiblaze.com/route/*).
// See sibling route.ts for full explanation and revert instructions.
//
// TO REVERT to admin-api: replace PUT/DELETE fetch calls with APIBlazeClient
// PUT /route-configs/:projectName/:apiVersion/:encodedPath/:method and DELETE equivalent.
// Remove mapToPoliciesFormat() — the admin-api schema matches RouteEntry directly.
// ─────────────────────────────────────────────────────────────────────────────

const POLICIES_API_DOMAIN = process.env.POLICIES_API_DOMAIN || 'policies.apiblaze.com';
const POLICIES_API_TIMEOUT_MS = 10_000;

// Map the dashboard RouteEntry schema to the policies-api request body.
// Dashboard stores pre/post templates as single JSON strings; policies-api
// expects arrays of OpenFGA check objects — we parse and wrap in [].
// Throws on non-empty strings that contain invalid JSON so callers can return 400.
function mapToPoliciesFormat(entry: {
  require_authentication?: boolean;
  rule_mode?: 'check-write' | 'list';
  pre_request_auth_template?: string;
  post_response_policy_template?: string;
  list_objects_template?: string;
  cache_rules?: string;
  priority?: number;
  authorization_enabled?: boolean;
}) {
  function parseTemplate(s: string | undefined, fieldName: string): object[] {
    if (!s?.trim()) return [];
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      throw new SyntaxError(`Invalid JSON in ${fieldName}`);
    }
  }

  function parseConfig(s: string | undefined, fieldName: string): object | null {
    if (!s?.trim()) return null;
    try { return JSON.parse(s); } catch {
      throw new SyntaxError(`Invalid JSON in ${fieldName}`);
    }
  }

  return {
    rule_mode: entry.rule_mode ?? 'check-write',
    on_request_read: parseTemplate(entry.pre_request_auth_template, 'pre_request_auth_template'),
    post_response_write: parseTemplate(entry.post_response_policy_template, 'post_response_policy_template'),
    list_objects_read: parseConfig(entry.list_objects_template, 'list_objects_template'),
    authentication_config: { require_authentication: entry.require_authentication ?? true },
    cache_config: parseConfig(entry.cache_rules, 'cache_rules'),
    priority: entry.priority,
    authorization_enabled: entry.authorization_enabled ?? false,
  };
}

type Params = { projectName: string; apiVersion: string; method: string; path?: string[] };

// Reconstruct the API route path from the [[...path]] catch-all segments.
// e.g. params.path = ['api', 'v1', 'users', '{id}'] → '/api/v1/users/{id}'
// params.path is undefined/empty for root endpoints (path = '/').
// Encode { and } for the URL but keep slashes natural.
function buildPoliciesUrl(projectName: string, apiVersion: string, method: string, pathSegments: string[]): string {
  const routePath = '/' + pathSegments.join('/');
  const encodedPath = routePath.replace(/\{/g, '%7B').replace(/\}/g, '%7D');
  return `https://${projectName}.${POLICIES_API_DOMAIN}/route/${encodeURIComponent(method)}${encodedPath}?api_version=${encodeURIComponent(apiVersion)}`;
}

// ─── Ownership check ──────────────────────────────────────────────────────────
// Uses checkProjectName (admin-api) to verify the session user's team owns
// the project before allowing writes to policies-api.
//
// Cached for 30s per user+project to avoid N round-trips when saving many routes
// in a single Save Config operation (delete-all + re-add pattern).
const _ownershipCache = new Map<string, { result: { error: string; status: number } | null; expiry: number }>();

async function verifyOwnership(projectName: string, apiVersion: string): Promise<{ error: string; status: number } | null> {
  try {
    const userClaims = await getUserClaims();
    const cacheKey = `${userClaims.sub ?? ''}:${projectName}:${apiVersion}`;
    const cached = _ownershipCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) return cached.result;

    const client = createAPIBlazeClient({
      apiKey: process.env.INTERNAL_API_KEY || '',
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });
    const ownership = await client.checkProjectName(userClaims, projectName, apiVersion);
    let result: { error: string; status: number } | null = null;
    if (!ownership.project_id) result = { error: 'Project not found', status: 404 };
    // api_version is null when another team owns this project name
    else if (!ownership.api_version) result = { error: 'Forbidden', status: 403 };

    _ownershipCache.set(cacheKey, { result, expiry: Date.now() + 30_000 });
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unauthorized';
    if (msg.includes('Unauthorized') || msg.includes('no session')) return { error: 'Unauthorized', status: 401 };
    return { error: 'Failed to verify project ownership', status: 500 };
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { projectName, apiVersion, method, path: pathSegments } = await params;
    if (!/^[a-z0-9]+$/.test(projectName)) {
      return NextResponse.json({ error: 'Invalid project name' }, { status: 400 });
    }
    const ownershipError = await verifyOwnership(projectName, apiVersion);
    if (ownershipError) return NextResponse.json({ error: ownershipError.error }, { status: ownershipError.status });

    const segments = pathSegments ?? [];
    const routePath = '/' + segments.join('/');

    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    let policiesBody: ReturnType<typeof mapToPoliciesFormat>;
    try {
      policiesBody = mapToPoliciesFormat(body as Parameters<typeof mapToPoliciesFormat>[0]);
    } catch (e) {
      return NextResponse.json({ error: e instanceof SyntaxError ? e.message : 'Invalid config field' }, { status: 400 });
    }

    const putUrl = buildPoliciesUrl(projectName, apiVersion, method, segments);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), POLICIES_API_TIMEOUT_MS);

    // Try PUT first (update existing route).
    // On 404 the route doesn't exist yet — fall back to POST /route to create it.
    let res: Response;
    try {
      res = await fetch(putUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...policiesBody, resource: routePath }),
        signal: controller.signal,
      });

      if (res.status === 404) {
        const postUrl = `https://${projectName}.${POLICIES_API_DOMAIN}/route?api_version=${encodeURIComponent(apiVersion)}`;
        res = await fetch(postUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: method.toUpperCase(), resource: routePath, ...policiesBody }),
          signal: controller.signal,
        });
      }
    } finally {
      clearTimeout(timer);
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
    const { projectName, apiVersion, method, path: pathSegments } = await params;
    if (!/^[a-z0-9]+$/.test(projectName)) {
      return NextResponse.json({ error: 'Invalid project name' }, { status: 400 });
    }
    const ownershipError = await verifyOwnership(projectName, apiVersion);
    if (ownershipError) return NextResponse.json({ error: ownershipError.error }, { status: ownershipError.status });
    const url = buildPoliciesUrl(projectName, apiVersion, method, pathSegments ?? []);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), POLICIES_API_TIMEOUT_MS);
    const res = await fetch(url, { method: 'DELETE', signal: controller.signal }).finally(() => clearTimeout(timer));

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
