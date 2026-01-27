'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Zap, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserMenu } from '@/components/user-menu';
import { AuthConfigList } from '@/components/auth-configs/auth-config-list';
import { AuthConfigDetail } from '@/components/auth-configs/auth-config-detail';
import { AppClientDetail } from '@/components/auth-configs/app-client-detail';
import { ProviderDetail } from '@/components/auth-configs/provider-detail';
import { BreadcrumbNav } from '@/components/auth-configs/breadcrumb-nav';

function AuthConfigsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [mounted, setMounted] = useState(false);

  const authConfigId = searchParams.get('authConfig');
  const clientId = searchParams.get('client');
  const providerId = searchParams.get('provider');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login?returnUrl=/dashboard/auth-configs');
    }
  }, [status, router]);

  if (status === 'loading' || !mounted) {
    return null;
  }

  const getBreadcrumbs = () => {
    const items = [];
    
    if (authConfigId) {
      items.push({
        label: 'Auth Config',
        href: `/dashboard/auth-configs?authConfig=${authConfigId}`,
      });
    }
    
    if (clientId && authConfigId) {
      items.push({
        label: 'App Client',
        href: `/dashboard/auth-configs?authConfig=${authConfigId}&client=${clientId}`,
      });
    }
    
    if (providerId && clientId && authConfigId) {
      items.push({
        label: 'Provider',
      });
    }
    
    return items;
  };

  const handleBack = () => {
    if (providerId && clientId && authConfigId) {
      router.push(`/dashboard/auth-configs?authConfig=${authConfigId}&client=${clientId}`);
    } else if (clientId && authConfigId) {
      router.push(`/dashboard/auth-configs?authConfig=${authConfigId}`);
    } else if (authConfigId) {
      router.push('/dashboard/auth-configs');
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
              <p className="text-xs text-muted-foreground">Auth Configs Management</p>
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
        {(authConfigId || clientId || providerId) && (
          <BreadcrumbNav items={getBreadcrumbs()} />
        )}

        {/* Conditional Rendering based on URL params */}
        {providerId && clientId && authConfigId ? (
          <ProviderDetail
            authConfigId={authConfigId}
            clientId={clientId}
            providerId={providerId}
            onBack={handleBack}
          />
        ) : clientId && authConfigId ? (
          <AppClientDetail
            authConfigId={authConfigId}
            clientId={clientId}
            onBack={handleBack}
          />
        ) : authConfigId ? (
          <AuthConfigDetail
            authConfigId={authConfigId}
            onBack={handleBack}
          />
        ) : (
          <AuthConfigList />
        )}
      </main>
    </div>
  );
}

export default function AuthConfigsPage() {
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
                  <p className="text-xs text-muted-foreground">Auth Configs Management</p>
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
      <AuthConfigsContent />
    </Suspense>
  );
}

