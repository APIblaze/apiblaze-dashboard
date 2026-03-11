import { NextRequest, NextResponse } from 'next/server';
import { APIBlazeError, createAPIBlazeClient } from '@/lib/apiblaze-client';
import { getDefaultScopesForProvider } from '@/lib/provider-default-scopes';
import { getUserClaims } from '../projects/_utils';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';
const DEFAULT_TENANT_NAME = 'api';

/**
 * Create tenant (api), AppClient, and default GitHub provider.
 * Tenant-only; no AuthConfig. Returns team_id, tenant_name, appClientId.
 */
export async function GET() {
  return NextResponse.json(
    {
      error: 'Method not allowed',
      message: 'Use POST with body: { teamId, appClientName, projectName, apiVersion, scopes? }',
      endpoint: '/api/create-with-default-github',
    },
    { status: 405, headers: { 'Allow': 'POST' } }
  );
}

export async function POST(request: NextRequest) {
  try {
    const userClaims = await getUserClaims();
    const body = await request.json();
    const {
      teamId,
      appClientName,
      projectName,
      apiVersion,
      scopes,
      tenantName: requestedTenantName,
    } = body;
    const TENANT_NAME = (typeof requestedTenantName === 'string' && requestedTenantName.trim())
      ? requestedTenantName.trim()
      : DEFAULT_TENANT_NAME;

    if (!teamId || typeof teamId !== 'string' || !teamId.trim()) {
      return NextResponse.json(
        { error: 'teamId is required' },
        { status: 400 }
      );
    }
    if (!appClientName || !projectName || !apiVersion) {
      return NextResponse.json(
        { error: 'appClientName, projectName, and apiVersion are required' },
        { status: 400 }
      );
    }

    const defaultClientId = process.env.APIBLAZE_PORTAL_GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID;
    const defaultClientSecret = process.env.APIBLAZE_PORTAL_GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET;

    if (!defaultClientId || !defaultClientSecret) {
      return NextResponse.json(
        {
          error: 'Default GitHub OAuth credentials not configured',
          details: 'Set APIBLAZE_PORTAL_GITHUB_CLIENT_ID and APIBLAZE_PORTAL_GITHUB_CLIENT_SECRET (or GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET) in the dashboard environment.',
        },
        { status: 500 }
      );
    }

    const adminApiBase = process.env.APIBLAZE_ADMIN_API_BASE || 'https://internalapi.apiblaze.com';
    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
      baseUrl: adminApiBase,
    });

    const trimmedTeamId = String(teamId).trim();
    const defaultGitHubScopes = getDefaultScopesForProvider('github');
    const effectiveScopes = Array.isArray(scopes) && scopes.length > 0 ? scopes : defaultGitHubScopes;

    const tenantsRes = await client.getTeamTenants(userClaims, trimmedTeamId, true);
    const tenantsList = Array.isArray((tenantsRes as { tenants?: unknown }).tenants)
      ? (tenantsRes as { tenants: Array<{ tenant_name?: string } | string> }).tenants
      : [];
    const hasApiTenant = tenantsList.some(
      (t: { tenant_name?: string } | string) =>
        typeof t === 'string' ? t === TENANT_NAME : (t?.tenant_name === TENANT_NAME)
    );
    if (!hasApiTenant) {
      try {
        await client.createTeamTenant(userClaims, trimmedTeamId, {
          tenant_name: TENANT_NAME,
          display_name: 'Default',
        });
      } catch (err) {
        console.error('[create-with-default-github] createTeamTenant failed:', err);
        throw err;
      }
    }

    const defaultCallbackUrl = `https://${String(projectName).trim()}-${TENANT_NAME}.portal.apiblaze.com/${String(apiVersion).trim()}`;
    let appClient: Record<string, unknown>;
    try {
      appClient = (await client.createAppClientForTenant(
        userClaims,
        trimmedTeamId,
        TENANT_NAME,
        {
          name: String(appClientName).trim(),
          projectName: String(projectName).trim(),
          apiVersion: String(apiVersion).trim(),
          tenant: TENANT_NAME,
          scopes: effectiveScopes,
          authorizedCallbackUrls: [defaultCallbackUrl],
        }
      )) as Record<string, unknown>;
    } catch (err) {
      console.error('[create-with-default-github] createAppClientForTenant failed:', err);
      throw err;
    }
    const appClientId = (appClient as { id?: string }).id ?? (appClient as { clientId?: string }).clientId;
    if (!appClientId) {
      return NextResponse.json(
        { error: 'App client creation did not return client id' },
        { status: 500 }
      );
    }

    try {
      await client.addProviderByTenant(userClaims, trimmedTeamId, TENANT_NAME, String(appClientId), {
        type: 'github',
        clientId: defaultClientId,
        clientSecret: defaultClientSecret,
        domain: 'https://github.com',
        scopes: defaultGitHubScopes,
      });
    } catch (err) {
      console.error('[create-with-default-github] addProviderByTenant failed:', err);
      throw err;
    }

    return NextResponse.json({
      team_id: trimmedTeamId,
      tenant_name: TENANT_NAME,
      appClientId: String(appClientId),
    });
  } catch (error) {
    console.error('Error creating tenant + app client + default GitHub:', error);

    if (error instanceof APIBlazeError) {
      return NextResponse.json(
        {
          error: error.body?.error || 'Failed to create tenant with default GitHub',
          details: error.body?.details ?? error.body?.error,
          suggestions: error.body?.suggestions,
        },
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create tenant with default GitHub',
      },
      { status: 500 }
    );
  }
}
