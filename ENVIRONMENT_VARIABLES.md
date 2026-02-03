# Environment Variables Configuration

## Required Environment Variables

### App Configuration
```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
# or in production:
# NEXT_PUBLIC_APP_URL=https://dashboard.apiblaze.com
```

### Auth Worker (Cloudflare Worker for OAuth)
```bash
NEXT_PUBLIC_AUTH_WORKER_URL=https://auth.apiblaze.com
```

### Internal API (Backend for project management)
```bash
INTERNAL_API_URL=https://internalapi.apiblaze.com
INTERNAL_API_KEY=your-internal-api-key
```

### GitHub OAuth Configuration (NextAuth)
```bash
# The numeric ID of your GitHub App
GITHUB_APP_ID=1093969

# URL where users install the app
GITHUB_APP_INSTALL_URL=https://github.com/apps/apiblaze/installations/new

# GitHub OAuth App credentials (for NextAuth)
GITHUB_CLIENT_ID=your-github-oauth-app-client-id
GITHUB_CLIENT_SECRET=your-github-oauth-app-client-secret

# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3000
# In production: NEXTAUTH_URL=https://dashboard.apiblaze.com
NEXTAUTH_SECRET=your-random-secret-string-here
# Generate with: openssl rand -base64 32
```

## Test Environment (code.julienjacquet.com:3000)

For your test deployment at `http://code.julienjacquet.com:3000`, set these so login redirects back to the test env instead of production:

```bash
NEXTAUTH_URL=http://code.julienjacquet.com:3000
NEXT_PUBLIC_DASHBOARD_URL=http://code.julienjacquet.com:3000
NEXT_PUBLIC_APP_URL=http://code.julienjacquet.com:3000
```

**GitHub OAuth App** (Settings → Developer settings → OAuth Apps → your app): add to **Authorization callback URL**:
```
http://code.julienjacquet.com:3000/api/auth/callback/github
```

Without these, NextAuth uses `NEXTAUTH_URL` (production) to tell GitHub where to redirect, so you end up on `https://dashboard.apiblaze.com/dashboard` after login.

## Optional Variables

### Portal Callback URL (for OAuth configuration)
```bash
# Default: https://apiportal.myInstantAPI.com
# For development/testing on custom domain:
NEXT_PUBLIC_PORTAL_CALLBACK_URL=http://code.julienjacquet.com:3000
# or
NEXT_PUBLIC_PORTAL_CALLBACK_URL=https://your-dev-portal-url.com
```

**Note**: This URL is shown in the authentication configuration UI as the callback URL that needs to be added to OAuth providers (Google, GitHub, etc.). In development, you can set this to your local or dev environment URL to test OAuth flows without pushing to production.

### Analytics
```bash
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```

## GitHub App Setup

The GitHub App at https://github.com/apps/apiblaze should be configured with:

### Callback URLs
- Homepage URL: `https://dashboard.apiblaze.com`
- **Setup URL**: `https://dashboard.apiblaze.com/github/callback` ← IMPORTANT!
- Callback URL: `https://dashboard.apiblaze.com/github/callback`

**Note**: The Setup URL is where GitHub redirects users after they install the app. This MUST be set to `/github/callback` for the auto-open flow to work.

### Permissions Required
- **Repository contents**: Read-only
- **Repository metadata**: Read-only

### User permissions
- **Read access to code**: To read OpenAPI spec files

## How Installation Detection Works

1. User clicks "Import from GitHub" button
2. Frontend checks if they're authenticated (has GitHub access token)
3. Calls `/api/github/installation-status` with `Authorization: Bearer {access_token}` header
4. Backend uses Octokit to call GitHub API: `octokit.rest.apps.listInstallationsForAuthenticatedUser()`
5. Checks if APIBlaze app (ID: 1093969) is in the installations list
6. Returns `{ installed: true }` or `{ installed: false }`
7. Frontend shows appropriate UI (browse repos or install prompt)

## Notes

- The `GITHUB_APP_ID` is the numeric ID of the APIBlaze GitHub App
- All GitHub API calls from backend routes use the user's GitHub access token passed via Authorization header
- Frontend stores the GitHub access token in localStorage (set during OAuth callback)
- Backend API routes extract the token from `Authorization: Bearer {token}` header

