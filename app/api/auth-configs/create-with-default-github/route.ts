import { NextRequest, NextResponse } from 'next/server';
import { APIBlazeError, createAPIBlazeClient } from '@/lib/apiblaze-client';
import { getDefaultScopesForProvider } from '@/lib/provider-default-scopes';
import { getUserClaims } from '../../projects/_utils';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

/**
 * Create an AuthConfig, AppClient, and Provider with default GitHub credentials
 * This keeps the GitHub client secret server-side only
 */
export async function POST(request: NextRequest) {
  try {
    const userClaims = await getUserClaims();
    const body = await request.json();
    const { authConfigName, appClientName, scopes, enableSocialAuth, enableApiKeyAuth, bringMyOwnOAuth, projectName, apiVersion } = body;

    if (!authConfigName || !appClientName) {
      return NextResponse.json(
        { error: 'authConfigName and appClientName are required' },
        { status: 400 }
      );
    }

    if (!projectName || !apiVersion) {
      return NextResponse.json(
        { error: 'projectName and apiVersion are required' },
        { status: 400 }
      );
    }

    // Use portal-specific GitHub OAuth app when configured to avoid invalidating dashboard tokens.
    // Dashboard uses GITHUB_CLIENT_ID (NextAuth); portal should use APIBLAZE_PORTAL_GITHUB_CLIENT_ID.
    const defaultClientId = process.env.APIBLAZE_PORTAL_GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID;
    const defaultClientSecret = 'REPLACE_WITH_APIBLAZE_CLIENT_SECRET'; // Auth worker injects from env

    if (!defaultClientId || !defaultClientSecret) {
      return NextResponse.json(
        { error: 'Default GitHub OAuth credentials not configured' },
        { status: 500 }
      );
    }

    const client = createAPIBlazeClient({
      apiKey: INTERNAL_API_KEY,
      jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
    });

    // 1. Check if AuthConfig with this name already exists, otherwise create it
    let authConfigId: string;
    const existingAuthConfigs = await client.listAuthConfigs(userClaims);
    const existingAuthConfig = Array.isArray(existingAuthConfigs)
      ? existingAuthConfigs.find((config: { name: string; id: string }) => config.name === authConfigName)
      : null;

    if (existingAuthConfig) {
      // Reuse existing auth config
      console.log('[create-with-default-github] Reusing existing AuthConfig:', {
        id: existingAuthConfig.id,
        name: existingAuthConfig.name,
      });
      authConfigId = existingAuthConfig.id;
    } else {
      // Create new auth config
      const authConfig = await client.createAuthConfig(userClaims, { 
        name: authConfigName,
        enableSocialAuth: enableSocialAuth,
        enableApiKeyAuth: enableApiKeyAuth,
        bringMyOwnOAuth: bringMyOwnOAuth,
      });
      authConfigId = (authConfig as { id: string }).id;
      console.log('[create-with-default-github] Created new AuthConfig:', {
        id: authConfigId,
        name: authConfigName,
        enableSocialAuth: enableSocialAuth,
        enableApiKeyAuth: enableApiKeyAuth,
        bringMyOwnOAuth: bringMyOwnOAuth,
      });
    }

    // 2. Create AppClient with GitHub scopes (providerType ensures correct defaults if scopes omitted)
    const defaultGitHubScopes = getDefaultScopesForProvider('github');
    const appClient = await client.createAppClient(userClaims, authConfigId, {
      name: appClientName,
      projectName: String(projectName).trim(),
      apiVersion: String(apiVersion).trim(),
      tenant: String(projectName).trim() || 'default',
      scopes: scopes || defaultGitHubScopes,
      providerType: 'github',
    });
    const appClientId = (appClient as { id: string }).id;

    // 3. Add default GitHub Provider only if one does not already exist (avoids duplicate providers
    //    when the internal API auto-adds a default GitHub provider on createAppClient)
    const existingProviders = await client.listProviders(userClaims, authConfigId, appClientId);
    const hasGitHubProvider = Array.isArray(existingProviders) && existingProviders.some(
      (p: { type?: string }) => (p?.type ?? '').toLowerCase() === 'github'
    );
    if (!hasGitHubProvider) {
      await client.addProvider(userClaims, authConfigId, appClientId, {
        type: 'github',
        clientId: defaultClientId,
        clientSecret: defaultClientSecret,
        domain: 'https://github.com',
        scopes: defaultGitHubScopes,
      });
    }

    return NextResponse.json({
      authConfigId,
      appClientId,
    });
  } catch (error) {
    console.error('Error creating AuthConfig with default GitHub:', error);
    
    if (error instanceof APIBlazeError) {
      return NextResponse.json(
        {
          error: error.body?.error || 'Failed to create AuthConfig with default GitHub',
          details: error.body?.details ?? error.body?.error,
          suggestions: error.body?.suggestions,
        },
        { status: error.status }
      );
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create AuthConfig with default GitHub' },
      { status: 500 }
    );
  }
}

