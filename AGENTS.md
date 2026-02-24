# AGENTS.md

## Cursor Cloud specific instructions

### Overview

APIBlaze Dashboard v3 is a single Next.js 15 (App Router) frontend application. It is **not** a monorepo. The app serves as a management dashboard for the APIBlaze API proxy platform.

### Running the application

- Dev server: `npm run dev` (uses Turbopack, runs on port 3000)
- See `README.md` for the full list of npm scripts (build, lint, start)

### Environment variables

A `.env.local` file is required. See the README "Environment Variables" section for the required keys. At minimum you need `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `INTERNAL_API_URL`, `INTERNAL_API_KEY`, and `NEXT_PUBLIC_APP_URL`.

### External dependencies

All backend functionality depends on external services **not included in this repo**:
- `internalapi.apiblaze.com` — core backend API for all CRUD operations
- GitHub OAuth App — authentication (the app has no local auth alternative)

The dashboard can be built and the dev server started without these services, but data-dependent features and login require them.

### Testing

There is no automated test framework configured (no Jest, Vitest, etc.). Lint is the only automated check: `npm run lint`. Manual browser testing is the primary validation method.

### Gotchas

- The app uses NextAuth.js 4 for authentication. If `NEXTAUTH_SECRET` is missing, the app will crash at runtime.
- Protected routes redirect to `/auth/login` via Next.js middleware; unauthenticated access to `/dashboard` is expected to redirect.
- The `jwt-private.pem` file is referenced by some API route handlers for signing JWT user assertions (`JWT_PRIVATE_KEY` env var). Only `jwt-public.pem` is committed to the repo.
