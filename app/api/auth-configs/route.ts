import { NextResponse } from 'next/server';

/** Auth config API deprecated: use tenants and tenant-scoped app clients. */
export async function GET() {
  return NextResponse.json(
    {
      error: 'Deprecated',
      message: 'Use Tenants and tenant-scoped app clients. GET /api/teams/[teamId]/tenants and tenant app client APIs.',
      migration: 'AuthConfig is removed; use Tenant → AppClients.',
    },
    { status: 410, headers: { 'Deprecation': 'true' } }
  );
}

export async function POST() {
  return NextResponse.json(
    {
      error: 'Deprecated',
      message: 'Use Tenants and tenant-scoped app clients. Create tenant via POST /api/teams/[teamId]/tenants, then create app client under tenant.',
      migration: 'AuthConfig is removed; use Tenant → AppClients.',
    },
    { status: 410, headers: { 'Deprecation': 'true' } }
  );
}
