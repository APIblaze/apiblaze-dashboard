'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Redirect /dashboard/auth-configs to /dashboard/tenants for backward compatibility.
 */
export default function AuthConfigsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const search = typeof window !== 'undefined' ? window.location.search : '';
    router.replace(`/dashboard/tenants${search}`);
  }, [router]);

  return null;
}
