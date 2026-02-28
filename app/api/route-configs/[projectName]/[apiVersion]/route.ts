import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/next-auth';

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
    pre_request_auth_template: onRead.length > 0 ? JSON.stringify(onRead[0]) : '',
    post_response_policy_template: postWrite.length > 0 ? JSON.stringify(postWrite[0]) : '',
    cache_rules: route.cache_config ? JSON.stringify(route.cache_config) : '',
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectName: string; apiVersion: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectName, apiVersion } = await params;
    if (!/^[a-z0-9]+$/.test(projectName)) {
      return NextResponse.json({ error: 'Invalid project name' }, { status: 400 });
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
