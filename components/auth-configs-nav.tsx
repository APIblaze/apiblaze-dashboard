'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, UserCog, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useDashboardCacheStore } from '@/store/dashboard-cache';
import { cn } from '@/lib/utils';

interface AuthConfigsNavProps {
  authConfigId?: string | null;
  clientId?: string | null;
  providerId?: string | null;
  className?: string;
}

export function AuthConfigsNav({
  authConfigId,
  clientId,
  providerId,
  className,
}: AuthConfigsNavProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const authConfigs = useDashboardCacheStore((s) => s.getAuthConfigs());
  const getAuthConfig = useDashboardCacheStore((s) => s.getAuthConfig);
  const getAppClient = useDashboardCacheStore((s) => s.getAppClient);
  const isBootstrapping = useDashboardCacheStore((s) => s.isBootstrapping);

  const authConfig = authConfigId ? getAuthConfig(authConfigId) : null;
  const appClient = authConfigId && clientId ? getAppClient(authConfigId, clientId) : null;

  const filteredConfigs = !search.trim()
    ? authConfigs
    : authConfigs.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.id.toLowerCase().includes(search.toLowerCase())
      );

  const hasDrillDown = !!(authConfigId || clientId || providerId);

  // When in auth configs with drill-down: breadcrumb style [Auth Configs] / [Auth Config] / [App Client] / [Provider]
  if (hasDrillDown) {
    return (
      <div
        className={cn(
          'flex items-center gap-1 rounded-md border bg-background px-3 py-2 min-h-9',
          className
        )}
      >
        {/* Auth Configs - click to go back to list */}
        <Link
          href="/dashboard/auth-configs"
          className="flex items-center gap-2 py-1 px-2 -ml-2 rounded-md hover:bg-accent transition-colors"
        >
          <div className="w-6 h-6 rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 flex items-center justify-center shrink-0">
            <UserCog className="h-3 w-3 text-white" />
          </div>
          <span className="text-sm font-medium">Auth Configs</span>
          <ChevronUp className="h-4 w-4 shrink-0 opacity-50" />
        </Link>

        {authConfigId && (
          <>
            <span className="text-muted-foreground/60 px-1 select-none">/</span>
            {/* Auth Config - dropdown to switch or go to detail */}
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 py-1 px-2 -mr-2 rounded-md hover:bg-accent transition-colors min-w-0"
                >
                  <span className="text-sm font-medium truncate max-w-[180px]">
                    {authConfig?.name ?? authConfigId}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0" align="start">
                <div className="border-b p-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search auth configs..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-8 h-9"
                    />
                  </div>
                </div>
                <div className="max-h-[240px] overflow-y-auto py-1">
                  <button
                    type="button"
                    onClick={() => {
                      router.push('/dashboard/auth-configs');
                      setOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent rounded-sm"
                  >
                    <UserCog className="h-4 w-4 text-muted-foreground shrink-0" />
                    All Auth Configs
                  </button>
                  <div className="border-t my-1" />
                  {isBootstrapping && authConfigs.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                      Loading...
                    </div>
                  ) : (
                    filteredConfigs.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          router.push(`/dashboard/auth-configs?authConfig=${encodeURIComponent(c.id)}`);
                          setOpen(false);
                        }}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent rounded-sm',
                          c.id === authConfigId && 'bg-accent'
                        )}
                      >
                        <span className="truncate">{c.name}</span>
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </>
        )}

        {authConfigId && clientId && (
          <>
            <span className="text-muted-foreground/60 px-1 select-none">/</span>
            {/* App Client - link to go back when at Provider, label when at App Client */}
            {providerId ? (
              <Link
                href={`/dashboard/auth-configs?authConfig=${encodeURIComponent(authConfigId)}&client=${encodeURIComponent(clientId)}`}
                className="flex items-center gap-2 py-1 px-2 rounded-md hover:bg-accent transition-colors min-w-0"
              >
                <span className="text-sm font-medium truncate max-w-[140px]">
                  {appClient?.name ?? clientId}
                </span>
                <ChevronUp className="h-4 w-4 shrink-0 opacity-50" />
              </Link>
            ) : (
              <span className="text-sm font-medium px-2 py-1 bg-muted rounded-md truncate max-w-[140px]">
                {appClient?.name ?? clientId}
              </span>
            )}
          </>
        )}

        {authConfigId && clientId && providerId && (
          <>
            <span className="text-muted-foreground/60 px-1 select-none">/</span>
            <span className="text-sm font-medium px-2 py-1 bg-muted rounded-md">
              Provider
            </span>
          </>
        )}
      </div>
    );
  }

  // When not in auth configs: single selector to open auth configs
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 rounded-md border bg-background px-3 py-2 min-h-9 hover:bg-accent/50 transition-colors',
            className
          )}
        >
          <div className="w-6 h-6 rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 flex items-center justify-center shrink-0">
            <UserCog className="h-3 w-3 text-white" />
          </div>
          <span className="text-sm font-medium">Auth Configs</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search auth configs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>
        <div className="max-h-[280px] overflow-y-auto py-1">
          <button
            type="button"
            onClick={() => {
              router.push('/dashboard/auth-configs');
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent rounded-sm font-medium"
          >
            <UserCog className="h-4 w-4 text-muted-foreground shrink-0" />
            All Auth Configs
          </button>
          <div className="border-t my-1" />
          {isBootstrapping && authConfigs.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">
              Loading...
            </div>
          ) : filteredConfigs.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">
              {search ? 'No auth configs match.' : 'No auth configs yet.'}
            </div>
          ) : (
            filteredConfigs.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  router.push(`/dashboard/auth-configs?authConfig=${encodeURIComponent(c.id)}`);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent rounded-sm"
              >
                <span className="truncate">{c.name}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
