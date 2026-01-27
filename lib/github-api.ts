'use client';

import { signOut } from 'next-auth/react';
import { clearGitHubReposCache } from './github-repos-cache';

/**
 * Wrapper for fetch that automatically logs out the user when GitHub credentials have expired (401).
 * This should be used for all GitHub API calls to ensure users are logged out when their
 * GitHub OAuth token expires.
 * 
 * @param url - The API endpoint URL
 * @param options - Standard fetch options
 * @returns Promise<Response>
 */
export async function fetchGitHubAPI(
  url: string,
  options?: RequestInit
): Promise<Response> {
  // Ensure credentials are included for session-based auth
  const fetchOptions: RequestInit = {
    ...options,
    credentials: 'include',
  };

  const response = await fetch(url, fetchOptions);

  // If we get a 401 from a GitHub API endpoint, the credentials have expired
  // Automatically log out the user
  if (response.status === 401) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error || 'GitHub authentication expired';
    
    // Check if this is specifically a GitHub token expiration issue
    // This includes GitHub API endpoints and the openapi/parse endpoint which uses GitHub credentials
    if (
      errorMessage.includes('expired') ||
      errorMessage.includes('Invalid') ||
      errorMessage.includes('Not authenticated') ||
      url.includes('/api/github/') ||
      url.includes('/api/openapi/parse')
    ) {
      console.warn('[GitHub API] Credentials expired, logging out user:', errorMessage);
      
      // Clear GitHub repos cache before logging out
      clearGitHubReposCache();
      
      // Sign out and redirect to login
      await signOut({ 
        callbackUrl: '/auth/login',
        redirect: true 
      });
    }
  }

  return response;
}

