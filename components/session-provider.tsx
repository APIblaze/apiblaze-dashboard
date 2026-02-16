'use client';

import { SessionProvider } from 'next-auth/react';
import { AuthPing } from '@/components/auth-ping';

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AuthPing />
      {children}
    </SessionProvider>
  );
}

