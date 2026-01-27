import { NextRequest, NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import type { RestEndpointMethodTypes } from '@octokit/rest';
import { RequestError } from '@octokit/request-error';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/next-auth';

type GitTreeItem =
  RestEndpointMethodTypes['git']['getTree']['response']['data']['tree'][number];

type RepositoryContent =
  RestEndpointMethodTypes['repos']['getContent']['response']['data'];

type ContentFile = Extract<RepositoryContent, { type: 'file' }>;

type OpenAPISpecSummary = {
  name: string | undefined;
  path: string;
  type: 'openapi' | 'swagger';
  version: string;
};

function isContentFile(content: RepositoryContent): content is ContentFile {
  return !Array.isArray(content) && 'content' in content;
}

async function getRouteParams(context: unknown): Promise<{ owner: string; repo: string }> {
  if (
    typeof context === 'object' &&
    context !== null &&
    'params' in context
  ) {
    const params = await (context as { params: Promise<Record<string, unknown>> }).params;
    if (params && typeof params === 'object') {
      const { owner, repo } = params;
      if (typeof owner === 'string' && typeof repo === 'string') {
        return { owner, repo };
      }
    }
  }

  throw new Error('Invalid route parameters');
}

const openAPIPatterns = [
  /openapi\.(yaml|yml|json)$/i,
  /swagger\.(yaml|yml|json)$/i,
  /api\.(yaml|yml|json)$/i,
  /oas\.(yaml|yml|json)$/i,
];

export async function GET(
  _request: NextRequest,
  context: unknown
) {
  try {
    const { owner, repo } = await getRouteParams(context);
    
    // Get and validate session (NextAuth)
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      console.log('No valid session or access token found');
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Initialize Octokit with the GitHub access token from session
    const octokit = new Octokit({ 
      auth: session.accessToken,
      request: {
        timeout: 15000 // 15 second timeout for tree scan
      }
    });

    // Get repository's default branch
    const { data: repoData } = await octokit.repos.get({ owner, repo });
    const defaultBranch = repoData.default_branch;

    // Get repository tree recursively to find all files
    const { data: tree } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: defaultBranch,
      recursive: 'true',
    });

    // Find potential OpenAPI files
    const potentialFiles = tree.tree.filter((item: GitTreeItem) => {
      if (item.type !== 'blob') return false;
      return openAPIPatterns.some(pattern => pattern.test(item.path || ''));
    });

    // Verify each file is actually an OpenAPI spec
    const detectedSpecs = await Promise.all(
      potentialFiles.map(async (file): Promise<OpenAPISpecSummary | null> => {
        try {
          // Fetch file content
          const { data: fileDataRaw } = await octokit.repos.getContent({
            owner,
            repo,
            path: file.path ?? '',
            ref: defaultBranch,
          });

          if (!isContentFile(fileDataRaw)) {
            return null;
          }

          // Decode base64 content
          const content = Buffer.from(fileDataRaw.content, 'base64').toString('utf-8');
          
          // Quick check if it's an OpenAPI/Swagger spec
          const isOpenAPI = content.includes('openapi:') || content.includes('"openapi"');
          const isSwagger = content.includes('swagger:') || content.includes('"swagger"');
          
          if (!(isOpenAPI || isSwagger)) {
            return null;
          }

          // Try to extract version
          let version = '1.0.0';
          const openAPIMatch = content.match(/openapi:\s*['"]?(\d+\.\d+\.\d+)/i);
          const swaggerMatch = content.match(/swagger:\s*['"]?(\d+\.\d+)/i);
          
          if (openAPIMatch) {
            version = openAPIMatch[1];
          } else if (swaggerMatch) {
            version = swaggerMatch[1];
          }

          return {
            name: file.path?.split('/').pop(),
            path: file.path ?? '',
            type: isOpenAPI ? 'openapi' : 'swagger',
            version,
          };
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Error checking file ${file.path}:`, message);
          return null;
        }
      })
    );

    // Filter out nulls and return
    const validSpecs = detectedSpecs.filter(
      (spec): spec is OpenAPISpecSummary => spec !== null
    );
    
    return NextResponse.json(validSpecs);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error detecting OpenAPI specs:', message);

    if (error instanceof RequestError && error.status === 404) {
      return NextResponse.json(
        { error: 'Repository or branch not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to detect OpenAPI specifications' },
      { status: 500 }
    );
  }
}
