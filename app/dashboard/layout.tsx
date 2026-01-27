'use client';

import { DashboardCacheProvider } from '@/components/dashboard-cache-provider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardCacheProvider>{children}</DashboardCacheProvider>;
}
