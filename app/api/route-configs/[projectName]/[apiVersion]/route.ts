import { NextRequest, NextResponse } from 'next/server';
import { createAPIBlazeClient } from '@/lib/apiblaze-client';
import { getUserClaims } from '@/app/api/projects/_utils';

// ─── ROUTE CONFIG STORAGE DECISION ───────────────────────────────────────────
// Proxies to policies-api (*.policies.apiblaze.com) rather than admin-api
// route-configs (internalapi.apiblaze.com/route-configs/*).
//
// WHY: The main proxy reads route_config_patterns KV which is only written by
// the policies-api on every POST/PUT/DELETE /route call. Admin-api route-configs
// writes to a separate KV namespace the proxy never reads — changes there are no-ops.
//
// TO REVERT to admin-api: replace the fetch below with an APIBlazeClient call to
// GET /route-configs/:projectName/:apiVersion on internalapi.apiblaze.com (same auth
// pattern as /api/projects/route.ts). The response schema is already RouteEntry-shaped
// so mapFromPoliciesFormat() can also be removed.
// ─────────────────────────────────────────────────────────────────────────────

const POLICIES_API_DOMAIN = process.env.POLICIES_API_DOMAIN || 'policies.apiblaze.com';

// policies-api stores on_request_read / post_response_write as arrays of OpenFGA
// check objects. The dashboard represents these as single JSON template strings,
// so we take the first element of each array and stringify it back.
function mapFromPoliciesFormat(route: Record<string, unknown>) {
  const onRead = Array.isArray(route.on_request_read) ? route.on_request_read : [];
  const postWrite = Array.isArray(route.post_response_write) ? route.post_response_write : [];
  const authCfg = route.authentication_config as Record<string, unknown> | null | undefined;

  return {
    path: route.resource as string,
    method: route.method as string,
    description: '',
    require_authentication: authCfg?.require_authentication !== undefined
      ? Boolean(authCfg.require_authentication)
      : true,
    authorization_enabled: route.authorization_enabled === true || route.authorization_enabled === 1,
    pre_request_auth_template: onRead.length > 0 ? JSON.stringify(onRead[0]) : '',
    post_response_policy_template: postWrite.length > 0 ? JSON.stringify(postWrite[0]) : '',
    cache_rules: route.cache_config ? JSON.stringify(route.cache_config) : '',
    priority: typeof route.priority === 'number' ? route.priority : undefined,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectName: string; apiVersion: string }> }
) {
  try {
    const { projectName, apiVersion } = await params;
    if (!/^[a-z0-9]+$/.test(projectName)) {
      return NextResponse.json({ error: 'Invalid project name' }, { status: 400 });
    }

    // Ownership check — same pattern as the PUT/DELETE sibling route.
    // Any logged-in user could otherwise read another project's authorization policy templates.
    try {
      const userClaims = await getUserClaims();
      const client = createAPIBlazeClient({
        apiKey: process.env.INTERNAL_API_KEY || '',
        jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
      });
      const ownership = await client.checkProjectName(userClaims, projectName, apiVersion);
      if (!ownership.project_id) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      if (!ownership.api_version) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      const status = msg.includes('Unauthorized') || msg.includes('no session') ? 401 : 500;
      return NextResponse.json({ error: status === 401 ? 'Unauthorized' : 'Failed to verify project ownership' }, { status });
    }
    const url = `https://${projectName}.${POLICIES_API_DOMAIN}/routes?api_version=${encodeURIComponent(apiVersion)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));

    if (res.status === 404) {
      return NextResponse.json({ project_id: projectName, api_version: apiVersion, routes: [] });
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      return NextResponse.json({ error: err.error || 'Failed to fetch route configs' }, { status: res.status });
    }

    const data = await res.json() as { routes: Record<string, unknown>[] };
    return NextResponse.json({
      project_id: projectName,
      api_version: apiVersion,
      routes: (data.routes ?? []).map(mapFromPoliciesFormat),
    });
  } catch (error) {
    console.error('[route-configs GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
