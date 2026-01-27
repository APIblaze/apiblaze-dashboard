'use client';

/**
 * Cache utility for GitHub repositories search results.
 * Caches results in localStorage until user logs out.
 */

const CACHE_KEY = 'github_repos_cache';
const OPENAPI_SPECS_CACHE_KEY = 'github_openapi_specs_cache';

export interface CachedGitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string;
  default_branch: string;
  updated_at: string;
  language: string;
  stargazers_count: number;
}

/**
 * Get cached GitHub repositories
 * @returns Cached repos array or null if cache doesn't exist or is invalid
 */
export function getCachedGitHubRepos(): CachedGitHubRepo[] | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) {
      return null;
    }

    const parsed = JSON.parse(cached) as CachedGitHubRepo[];
    
    // Validate that it's an array
    if (!Array.isArray(parsed)) {
      clearGitHubReposCache();
      return null;
    }

    return parsed;
  } catch (error) {
    console.error('[GitHub Cache] Error reading cache:', error);
    clearGitHubReposCache();
    return null;
  }
}

/**
 * Cache GitHub repositories
 * @param repos - Array of GitHub repositories to cache
 */
export function setCachedGitHubRepos(repos: CachedGitHubRepo[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(repos));
  } catch (error) {
    console.error('[GitHub Cache] Error writing cache:', error);
  }
}

/**
 * Clear the GitHub repositories cache
 * Should be called when user logs out
 */
export function clearGitHubReposCache(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(OPENAPI_SPECS_CACHE_KEY);
  } catch (error) {
    console.error('[GitHub Cache] Error clearing cache:', error);
  }
}

export interface CachedOpenAPIFile {
  name: string;
  path: string;
  type: 'openapi' | 'swagger';
  version?: string;
}

/**
 * Get cached OpenAPI specs for a repository
 * @param repoFullName - Full name of the repo (owner/repo)
 * @returns Cached OpenAPI specs array or null if cache doesn't exist
 */
export function getCachedOpenAPISpecs(repoFullName: string): CachedOpenAPIFile[] | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const cached = localStorage.getItem(OPENAPI_SPECS_CACHE_KEY);
    if (!cached) {
      return null;
    }

    const parsed = JSON.parse(cached) as Record<string, CachedOpenAPIFile[]>;
    return parsed[repoFullName] || null;
  } catch (error) {
    console.error('[GitHub Cache] Error reading OpenAPI specs cache:', error);
    return null;
  }
}

/**
 * Cache OpenAPI specs for a repository
 * @param repoFullName - Full name of the repo (owner/repo)
 * @param specs - Array of OpenAPI spec files
 */
export function setCachedOpenAPISpecs(repoFullName: string, specs: CachedOpenAPIFile[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const cached = localStorage.getItem(OPENAPI_SPECS_CACHE_KEY);
    const allSpecs = cached ? (JSON.parse(cached) as Record<string, CachedOpenAPIFile[]>) : {};
    allSpecs[repoFullName] = specs;
    localStorage.setItem(OPENAPI_SPECS_CACHE_KEY, JSON.stringify(allSpecs));
  } catch (error) {
    console.error('[GitHub Cache] Error writing OpenAPI specs cache:', error);
  }
}

