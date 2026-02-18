'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { RouteEntry } from './types';

type PathGroup = {
  basePath: string;
  entries: RouteEntry[];
};

/** Extract base path for grouping: /api/v2/ability and /api/v2/ability/{id} both → /api/v2/ability */
function getBasePath(path: string): string {
  const trimmed = path.replace(/\/+$/, '') || '/';
  const idx = trimmed.indexOf('{');
  if (idx === -1) return trimmed;
  const beforeParam = trimmed.substring(0, idx).replace(/\/+$/, '');
  return beforeParam || '/';
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

function isValidJson(value: string): boolean {
  if (!value || value.trim() === '') return true;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function extractOperationsFromSpec(spec: Record<string, unknown>): RouteEntry[] {
  const paths = spec.paths as Record<string, Record<string, unknown>> | undefined;
  if (!paths) return [];

  const operations: RouteEntry[] = [];
  for (const [path, pathItem] of Object.entries(paths)) {
    if (typeof pathItem !== 'object' || pathItem === null) continue;
    for (const [method, op] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.includes(method.toLowerCase())) continue;
      const operation = op as Record<string, unknown>;
      operations.push({
        path,
        method: method.toUpperCase(),
        description: (operation.summary ?? operation.description ?? '') as string,
        require_authentication: true,
        pre_request_auth_template: '',
        post_response_policy_template: '',
        cache_rules: '',
      });
    }
  }
  return operations;
}

function groupByBasePath(entries: RouteEntry[]): PathGroup[] {
  const byBase = new Map<string, RouteEntry[]>();
  for (const e of entries) {
    const base = getBasePath(e.path);
    const list = byBase.get(base) ?? [];
    list.push(e);
    byBase.set(base, list);
  }
  return Array.from(byBase.entries())
    .map(([basePath, entries]) => ({ basePath, entries }))
    .sort((a, b) => a.basePath.localeCompare(b.basePath));
}

function mergeWithExisting(
  fromSpec: RouteEntry[],
  existing: RouteEntry[]
): RouteEntry[] {
  const existingMap = new Map(
    existing.map((e) => [`${e.method}:${e.path}`, e])
  );
  return fromSpec.map((specEntry) => {
    const key = `${specEntry.method}:${specEntry.path}`;
    const existingEntry = existingMap.get(key);
    return existingEntry
      ? { ...specEntry, ...existingEntry }
      : specEntry;
  });
}

export interface RoutesTableRef {
  getRoutes: () => RouteEntry[];
}

interface RoutesTableProps {
  spec: Record<string, unknown> | null;
  existingRoutes: RouteEntry[];
  readOnly?: boolean;
  /** Optional ref to keep routes in sync for parent (e.g. when section unmounts on tab switch) */
  routesRef?: React.MutableRefObject<RouteEntry[]>;
}

export const RoutesTable = forwardRef<RoutesTableRef, RoutesTableProps>(
  function RoutesTable({ spec, existingRoutes, readOnly = false, routesRef: externalRoutesRef }, ref) {
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

    const merged = useMemo(() => {
      const fromSpec = spec ? extractOperationsFromSpec(spec) : [];
      const existing = externalRoutesRef?.current?.length ? externalRoutesRef.current : existingRoutes;
      return mergeWithExisting(fromSpec, existing);
    }, [spec, existingRoutes, externalRoutesRef]);

    const pathGroups = useMemo(
      () => groupByBasePath(merged),
      [merged]
    );

    const internalRoutesRef = useRef<RouteEntry[]>(merged);
    useEffect(() => {
      internalRoutesRef.current = merged;
      if (externalRoutesRef) externalRoutesRef.current = merged;
    }, [merged, externalRoutesRef]);

    useImperativeHandle(ref, () => ({
      getRoutes: () => internalRoutesRef.current ?? [],
    }), []);

    const togglePath = useCallback((basePath: string) => {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(basePath)) next.delete(basePath);
        else next.add(basePath);
        return next;
      });
    }, []);

    const updateRouteInRef = useCallback((path: string, method: string, updates: Partial<RouteEntry>) => {
      const updated = internalRoutesRef.current.map((r) =>
        r.path === path && r.method === method ? { ...r, ...updates } : r
      );
      internalRoutesRef.current = updated;
      if (externalRoutesRef) externalRoutesRef.current = updated;
    }, [externalRoutesRef]);

    if (pathGroups.length === 0) {
      return null;
    }

    return (
      <div className="w-full max-w-[80vw] min-w-0 rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left py-3 px-4 font-medium w-[180px]">Resource / Method</th>
                <th className="text-left py-3 px-4 font-medium w-[140px]">Description</th>
                <th className="text-left py-3 px-4 font-medium w-[90px]">Require Authentication</th>
                <th className="text-left py-3 px-4 font-medium min-w-[220px]">Require Authorization: Pre-request authorization template</th>
                <th className="text-left py-3 px-4 font-medium min-w-[220px]">Post-response policy template</th>
                <th className="text-left py-3 px-4 font-medium min-w-[180px]">Cache rules</th>
              </tr>
            </thead>
            <tbody>
              {pathGroups.map((group) => {
                const isExpanded = expandedPaths.has(group.basePath);
                const showPathInRow = group.entries.some((e) => e.path !== group.basePath);
                return (
                  <React.Fragment key={group.basePath}>
                    <tr
                      className="border-b hover:bg-muted/30 cursor-pointer"
                      onClick={() => togglePath(group.basePath)}
                    >
                      <td className="py-2 px-4">
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className="font-mono text-sm">{group.basePath}</span>
                          <Badge variant="secondary" className="text-xs">
                            {group.entries.length}
                          </Badge>
                        </div>
                      </td>
                      <td colSpan={5} className="py-2 px-4" />
                    </tr>
                    {isExpanded &&
                      group.entries.map((entry) => (
                        <RouteRow
                          key={`${entry.path}:${entry.method}`}
                          entry={entry}
                          updateRouteInRef={updateRouteInRef}
                          readOnly={readOnly}
                          showPath={showPathInRow}
                        />
                      ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
);

interface RouteRowProps {
  entry: RouteEntry;
  updateRouteInRef: (path: string, method: string, updates: Partial<RouteEntry>) => void;
  readOnly: boolean;
  showPath?: boolean;
}

function RouteRow({ entry, updateRouteInRef, readOnly, showPath = false }: RouteRowProps) {
  const [preReqError, setPreReqError] = useState(false);
  const [postRespError, setPostRespError] = useState(false);
  const [cacheError, setCacheError] = useState(false);

  const [localPreReq, setLocalPreReq] = useState(entry.pre_request_auth_template);
  const [localPostResp, setLocalPostResp] = useState(entry.post_response_policy_template);
  const [localCache, setLocalCache] = useState(entry.cache_rules);
  const [localAuth, setLocalAuth] = useState(entry.require_authentication);

  useEffect(() => {
    setLocalPreReq(entry.pre_request_auth_template);
    setLocalPostResp(entry.post_response_policy_template);
    setLocalCache(entry.cache_rules);
    setLocalAuth(entry.require_authentication);
  }, [
    entry.path,
    entry.method,
    entry.pre_request_auth_template,
    entry.post_response_policy_template,
    entry.cache_rules,
    entry.require_authentication,
  ]);

  const handleJsonBlur = (
    value: string,
    field: 'pre_request_auth_template' | 'post_response_policy_template' | 'cache_rules',
    setError: (v: boolean) => void
  ) => {
    const valid = isValidJson(value);
    setError(!valid);
    if (valid) updateRouteInRef(entry.path, entry.method, { [field]: value });
  };

  return (
    <tr className="border-b bg-muted/20 hover:bg-muted/30">
      <td className="py-2 px-4 pl-12">
        <div className="flex flex-col gap-1">
          {showPath && (
            <span className="font-mono text-xs text-muted-foreground">{entry.path}</span>
          )}
          <Badge
            variant="outline"
            className={cn(
              entry.method === 'GET' && 'border-green-500/50 text-green-700 dark:text-green-400',
              entry.method === 'POST' && 'border-blue-500/50 text-blue-700 dark:text-blue-400',
              entry.method === 'PUT' && 'border-amber-500/50 text-amber-700 dark:text-amber-400',
              entry.method === 'PATCH' && 'border-amber-500/50 text-amber-700 dark:text-amber-400',
              entry.method === 'DELETE' && 'border-red-500/50 text-red-700 dark:text-red-400'
            )}
          >
            {entry.method}
          </Badge>
        </div>
      </td>
      <td className="py-2 px-4">
        <span className="text-muted-foreground text-xs whitespace-normal break-words block">
          {entry.description || '—'}
        </span>
      </td>
      <td className="py-2 px-4">
        {readOnly ? (
          <span>{localAuth ? 'Yes' : 'No'}</span>
        ) : (
          <Switch
            checked={localAuth}
            onCheckedChange={(checked) => {
              setLocalAuth(checked);
              updateRouteInRef(entry.path, entry.method, { require_authentication: checked });
            }}
          />
        )}
      </td>
      <td className="py-2 px-4">
        {readOnly ? (
          <pre className="font-mono text-xs whitespace-pre-wrap break-words">{entry.pre_request_auth_template || '—'}</pre>
        ) : (
          <Textarea
            value={localPreReq}
            onChange={(e) => setLocalPreReq(e.target.value)}
            onBlur={(e) =>
              handleJsonBlur(
                e.target.value,
                'pre_request_auth_template',
                setPreReqError
              )
            }
            className={cn(
              'font-mono text-xs min-h-[60px]',
              preReqError && 'border-red-500'
            )}
            placeholder={'{"user":"user:{{userId}}","relation":"viewer","object":"reservation:{{path.id}}"}'}
            rows={2}
          />
        )}
      </td>
      <td className="py-2 px-4">
        {readOnly ? (
          <pre className="font-mono text-xs whitespace-pre-wrap break-words">{entry.post_response_policy_template || '—'}</pre>
        ) : (
          <Textarea
            value={localPostResp}
            onChange={(e) => setLocalPostResp(e.target.value)}
            onBlur={(e) =>
              handleJsonBlur(
                e.target.value,
                'post_response_policy_template',
                setPostRespError
              )
            }
            className={cn(
              'font-mono text-xs min-h-[60px]',
              postRespError && 'border-red-500'
            )}
            placeholder={'{"user":"user:{{userId}}","relation":"owner","object":"reservation:{{response.id}}"}'}
            rows={2}
          />
        )}
      </td>
      <td className="py-2 px-4">
        {readOnly ? (
          <pre className="font-mono text-xs whitespace-pre-wrap break-words">{entry.cache_rules || '—'}</pre>
        ) : (
          <Textarea
            value={localCache}
            onChange={(e) => setLocalCache(e.target.value)}
            onBlur={(e) =>
              handleJsonBlur(e.target.value, 'cache_rules', setCacheError)
            }
            className={cn(
              'font-mono text-xs min-h-[60px]',
              cacheError && 'border-red-500'
            )}
            placeholder=""
            rows={2}
          />
        )}
      </td>
    </tr>
  );
}
