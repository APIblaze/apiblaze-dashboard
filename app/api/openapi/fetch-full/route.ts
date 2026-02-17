import { NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import type { RestEndpointMethodTypes } from '@octokit/rest';
import { RequestError } from '@octokit/request-error';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/next-auth';
import * as yaml from 'js-yaml';

interface FetchFullRequestBody {
  owner: string;
  repo: string;
  path: string;
  branch?: string;
}

type RepositoryContent =
  RestEndpointMethodTypes['repos']['getContent']['response']['data'];

type ContentFile = Extract<RepositoryContent, { type: 'file' }>;

function isContentFile(content: RepositoryContent): content is ContentFile {
  return !Array.isArray(content) && 'content' in content;
}

function parseSpec(content: string, filePath: string): Record<string, unknown> {
  let rawSpec: unknown;

  if (filePath.endsWith('.json')) {
    rawSpec = JSON.parse(content);
  } else {
    rawSpec = yaml.load(content);
  }

  if (typeof rawSpec !== 'object' || rawSpec === null) {
    throw new Error('Parsed OpenAPI document is not an object');
  }

  return rawSpec as Record<string, unknown>;
}

/**
 * POST /api/openapi/fetch-full
 * Fetches full OpenAPI spec from GitHub (including paths) for Routes tab in new project creation.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FetchFullRequestBody;
    const { owner, repo, path, branch } = body;

    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const octokit = new Octokit({
      auth: session.accessToken,
      request: { timeout: 10000 },
    });

    const { data: fileData } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref: branch || 'main',
    });

    if (!isContentFile(fileData)) {
      return NextResponse.json(
        { error: 'File not found or is a directory' },
        { status: 404 }
      );
    }

    const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
    const spec = parseSpec(content, path);

    return NextResponse.json({ spec });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching full OpenAPI spec:', message);

    if (error instanceof RequestError && error.status === 404) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch OpenAPI specification', details: message },
      { status: 500 }
    );
  }
}
