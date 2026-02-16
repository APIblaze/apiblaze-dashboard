'use client';

import { useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';

const PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Lightweight authenticated ping every 5 minutes.
 * If the ping fails (401), the user is signed out.
 */
export function AuthPing() {
  const { data: session, status } = useSession();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status !== 'authenticated' || !session) return;

    const doPing = async () => {
      try {
        const res = await fetch('/api/auth/ping', { credentials: 'include' });
        if (res.status === 401) {
          await signOut({ callbackUrl: '/auth/login', redirect: true });
        }
      } catch {
        // Network error - don't sign out, might be temporary
      }
    };

    intervalRef.current = setInterval(doPing, PING_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [status, session]);

  return null;
}
