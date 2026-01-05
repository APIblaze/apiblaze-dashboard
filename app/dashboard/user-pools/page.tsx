'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Zap, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserMenu } from '@/components/user-menu';
import { UserPoolList } from '@/components/user-pools/user-pool-list';
import { UserPoolDetail } from '@/components/user-pools/user-pool-detail';
import { AppClientDetail } from '@/components/user-pools/app-client-detail';
import { ProviderDetail } from '@/components/user-pools/provider-detail';
import { BreadcrumbNav } from '@/components/user-pools/breadcrumb-nav';

function UserPoolsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [mounted, setMounted] = useState(false);

  const poolId = searchParams.get('pool');
  const clientId = searchParams.get('client');
  const providerId = searchParams.get('provider');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login?returnUrl=/dashboard/user-pools');
    }
  }, [status, router]);

  if (status === 'loading' || !mounted) {
    return null;
  }

  const getBreadcrumbs = () => {
    const items = [];
    
    if (poolId) {
      items.push({
        label: 'Pool',
        href: `/dashboard/user-pools?pool=${poolId}`,
      });
    }
    
    if (clientId && poolId) {
      items.push({
        label: 'App Client',
        href: `/dashboard/user-pools?pool=${poolId}&client=${clientId}`,
      });
    }
    
    if (providerId && clientId && poolId) {
      items.push({
        label: 'Provider',
      });
    }
    
    return items;
  };

  const handleBack = () => {
    if (providerId && clientId && poolId) {
      router.push(`/dashboard/user-pools?pool=${poolId}&client=${clientId}`);
    } else if (clientId && poolId) {
      router.push(`/dashboard/user-pools?pool=${poolId}`);
    } else if (poolId) {
      router.push('/dashboard/user-pools');
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">APIBlaze v3.0</h1>
              <p className="text-xs text-muted-foreground">User Pools Management</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => router.push('/dashboard')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
            <UserMenu />
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Breadcrumb Navigation */}
        {(poolId || clientId || providerId) && (
          <BreadcrumbNav items={getBreadcrumbs()} />
        )}

        {/* Conditional Rendering based on URL params */}
        {providerId && clientId && poolId ? (
          <ProviderDetail
            poolId={poolId}
            clientId={clientId}
            providerId={providerId}
            onBack={handleBack}
          />
        ) : clientId && poolId ? (
          <AppClientDetail
            poolId={poolId}
            clientId={clientId}
            onBack={handleBack}
          />
        ) : poolId ? (
          <UserPoolDetail
            poolId={poolId}
            onBack={handleBack}
          />
        ) : (
          <UserPoolList />
        )}
      </main>
    </div>
  );
}

export default function UserPoolsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
          <header className="border-b bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
            <div className="container mx-auto px-4 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">APIBlaze v3.0</h1>
                  <p className="text-xs text-muted-foreground">User Pools Management</p>
                </div>
              </div>
            </div>
          </header>
          <main className="container mx-auto px-4 py-8">
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </main>
        </div>
      }
    >
      <UserPoolsContent />
    </Suspense>
  );
}













