'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
      const normalizedPath = path.length > 1 ? path.replace(/\/+$/, '') : path;
      operations.push({
        path: normalizedPath,
        method: method.toUpperCase(),
        description: (operation.summary ?? operation.description ?? '') as string,
        require_authentication: true,
        authorization_enabled: false,
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

  const specKeys = new Set(fromSpec.map(e => `${e.method}:${e.path}`));
  const specMerged = fromSpec.map((specEntry) => {
    const key = `${specEntry.method}:${specEntry.path}`;
    const existingEntry = existingMap.get(key);
    return existingEntry ? { ...specEntry, ...existingEntry } : specEntry;
  });

  const extraRoutes = existing.filter(e => !specKeys.has(`${e.method}:${e.path}`));

  return [...specMerged, ...extraRoutes];
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
  /** When false, the "Enable Authorization" toggle is hidden (API-level kill switch is OFF) */
  enforceAuthorization?: boolean;
}

export const RoutesTable = forwardRef<RoutesTableRef, RoutesTableProps>(
  function RoutesTable({ spec, existingRoutes, readOnly = false, routesRef: externalRoutesRef, enforceAuthorization = false }, ref) {
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
    const [selectedKey, setSelectedKey] = useState<string | null>(null);

    const merged = useMemo(() => {
      const fromSpec = spec ? extractOperationsFromSpec(spec) : [];
      const existing = externalRoutesRef?.current?.length ? externalRoutesRef.current : existingRoutes;
      return mergeWithExisting(fromSpec, existing);
    }, [spec, existingRoutes, externalRoutesRef]);

    const pathGroups = useMemo(() => groupByBasePath(merged), [merged]);

    const internalRoutesRef = useRef<RouteEntry[]>(merged);
    useEffect(() => {
      internalRoutesRef.current = merged;
      if (externalRoutesRef) externalRoutesRef.current = merged;
    }, [merged, externalRoutesRef]);

    useImperativeHandle(ref, () => ({
      getRoutes: () => internalRoutesRef.current ?? [],
    }), []);

    // Auto-select first route and auto-expand its group on load
    useEffect(() => {
      if (pathGroups.length > 0 && !selectedKey) {
        const firstGroup = pathGroups[0];
        const firstEntry = firstGroup.entries[0];
        if (firstEntry) {
          setSelectedKey(`${firstEntry.method}:${firstEntry.path}`);
          setExpandedPaths(new Set([firstGroup.basePath]));
        }
      }
    }, [pathGroups, selectedKey]);

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

    const selectedEntry = useMemo(() => {
      if (!selectedKey) return null;
      const colonIdx = selectedKey.indexOf(':');
      const method = selectedKey.substring(0, colonIdx);
      const path = selectedKey.substring(colonIdx + 1);
      return merged.find(e => e.method === method && e.path === path) ?? null;
    }, [selectedKey, merged]);

    if (pathGroups.length === 0) {
      return null;
    }

    return (
      <div className="flex rounded-lg border overflow-hidden" style={{ minHeight: '460px', maxHeight: '72vh' }}>
        {/* Left panel: route list */}
        <div className="w-80 shrink-0 border-r overflow-y-auto bg-muted/20">
          {pathGroups.map((group) => {
            const isExpanded = expandedPaths.has(group.basePath);
            const groupHasSelected = group.entries.some(e => `${e.method}:${e.path}` === selectedKey);
            return (
              <div key={group.basePath}>
                <button
                  type="button"
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-3.5 text-sm font-medium border-b text-left transition-colors',
                    groupHasSelected
                      ? 'bg-primary/10 text-primary hover:bg-primary/20'
                      : 'hover:bg-muted/50'
                  )}
                  onClick={() => togglePath(group.basePath)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-mono text-xs truncate flex-1">{group.basePath}</span>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {group.entries.length}
                  </Badge>
                </button>
                {isExpanded && group.entries.map((entry) => {
                  const key = `${entry.method}:${entry.path}`;
                  const isSelected = selectedKey === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={cn(
                        'w-full flex items-center gap-2 px-4 py-3.5 text-left border-b transition-colors',
                        isSelected
                          ? 'bg-primary/15 border-l-[3px] border-l-primary hover:bg-primary/25'
                          : 'hover:bg-muted/40'
                      )}
                      onClick={() => setSelectedKey(key)}
                    >
                      <MethodBadge method={entry.method} />
                      <span className={cn('font-mono text-xs truncate', isSelected ? 'text-foreground font-medium' : 'text-muted-foreground')}>{entry.path}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Right panel: route detail */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedEntry ? (
            <RouteDetail
              key={selectedKey!}
              entry={selectedEntry}
              updateRouteInRef={updateRouteInRef}
              readOnly={readOnly}
              enforceAuthorization={enforceAuthorization}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Select a route to configure
            </div>
          )}
        </div>
      </div>
    );
  }
);

function MethodBadge({ method }: { method: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-xs shrink-0',
        method === 'GET' && 'border-green-500/50 text-green-700 dark:text-green-400',
        method === 'POST' && 'border-blue-500/50 text-blue-700 dark:text-blue-400',
        method === 'PUT' && 'border-amber-500/50 text-amber-700 dark:text-amber-400',
        method === 'PATCH' && 'border-amber-500/50 text-amber-700 dark:text-amber-400',
        method === 'DELETE' && 'border-red-500/50 text-red-700 dark:text-red-400'
      )}
    >
      {method}
    </Badge>
  );
}

interface RouteDetailProps {
  entry: RouteEntry;
  updateRouteInRef: (path: string, method: string, updates: Partial<RouteEntry>) => void;
  readOnly: boolean;
  enforceAuthorization: boolean;
}

function RouteDetail({ entry, updateRouteInRef, readOnly, enforceAuthorization }: RouteDetailProps) {
  const [preReqError, setPreReqError] = useState(false);
  const [postRespError, setPostRespError] = useState(false);
  const [cacheError, setCacheError] = useState(false);

  const [localPreReq, setLocalPreReq] = useState(entry.pre_request_auth_template);
  const [localPostResp, setLocalPostResp] = useState(entry.post_response_policy_template);
  const [localCache, setLocalCache] = useState(entry.cache_rules);
  const [localAuth, setLocalAuth] = useState(entry.require_authentication);
  const [localAuthzEnabled, setLocalAuthzEnabled] = useState(entry.authorization_enabled);
  const [localPriority, setLocalPriority] = useState<number | undefined>(entry.priority ?? undefined);

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
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-4 border-b space-y-1.5">
        <div className="flex items-center gap-3">
          <MethodBadge method={entry.method} />
          <span className="font-mono text-sm font-medium">{entry.path}</span>
        </div>
        {entry.description && (
          <p className="text-sm text-muted-foreground">{entry.description}</p>
        )}
      </div>

      {/* Toggles + Priority row */}
      <div className="flex flex-wrap items-center gap-8">
        <div className="flex items-center gap-3">
          <Label className="text-sm font-medium whitespace-nowrap">Require Authentication</Label>
          {readOnly ? (
            <span className="text-sm">{localAuth ? 'Yes' : 'No'}</span>
          ) : (
            <Switch
              checked={localAuth}
              onCheckedChange={(checked) => {
                setLocalAuth(checked);
                updateRouteInRef(entry.path, entry.method, { require_authentication: checked });
              }}
            />
          )}
        </div>

        {enforceAuthorization && (
          <div className="flex items-center gap-3">
            <Label className="text-sm font-medium whitespace-nowrap">Enable Authorization</Label>
            <Switch
              checked={localAuthzEnabled}
              onCheckedChange={(checked) => {
                setLocalAuthzEnabled(checked);
                updateRouteInRef(entry.path, entry.method, { authorization_enabled: checked });
              }}
            />
          </div>
        )}

        <div className="flex items-center gap-3">
          <Label className="text-sm font-medium">Priority</Label>
          {readOnly ? (
            <span className="text-sm">{localPriority ?? '—'}</span>
          ) : (
            <input
              type="number"
              min={1}
              value={localPriority ?? ''}
              onChange={(e) => setLocalPriority(e.target.value === '' ? undefined : Number(e.target.value))}
              onBlur={(e) => {
                const val = e.target.value === '' ? undefined : Number(e.target.value);
                if (val === undefined || (Number.isInteger(val) && val >= 1)) {
                  updateRouteInRef(entry.path, entry.method, { priority: val });
                }
              }}
              className="w-20 text-sm border rounded px-2 py-1 bg-background"
              placeholder="auto"
            />
          )}
        </div>
      </div>

      {/* Policy templates side-by-side */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">
            Check Policy
            <span className="ml-1.5 font-normal text-muted-foreground text-xs">(blocks request if denied)</span>
          </Label>
          {readOnly ? (
            <pre className="font-mono text-xs whitespace-pre-wrap break-words p-3 rounded border bg-muted/30 min-h-[120px]">
              {entry.pre_request_auth_template || '—'}
            </pre>
          ) : (
            <Textarea
              value={localPreReq}
              onChange={(e) => setLocalPreReq(e.target.value)}
              onBlur={(e) => handleJsonBlur(e.target.value, 'pre_request_auth_template', setPreReqError)}
              className={cn('font-mono text-xs', preReqError && 'border-red-500')}
              placeholder={'{\n  "user": "user:{{JWT.sub}}",\n  "relation": "viewer",\n  "object": "reservation:{{PATH.id}}"\n}'}
              rows={6}
            />
          )}
          {preReqError && <p className="text-xs text-red-500">Invalid JSON</p>}
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">
            Write Policy
            <span className="ml-1.5 font-normal text-muted-foreground text-xs">(runs after 2xx response)</span>
          </Label>
          {readOnly ? (
            <pre className="font-mono text-xs whitespace-pre-wrap break-words p-3 rounded border bg-muted/30 min-h-[120px]">
              {entry.post_response_policy_template || '—'}
            </pre>
          ) : (
            <Textarea
              value={localPostResp}
              onChange={(e) => setLocalPostResp(e.target.value)}
              onBlur={(e) => handleJsonBlur(e.target.value, 'post_response_policy_template', setPostRespError)}
              className={cn('font-mono text-xs', postRespError && 'border-red-500')}
              placeholder={'{\n  "user": "user:{{JWT.sub}}",\n  "relation": "owner",\n  "object": "reservation:{{RESPONSE.id}}"\n}'}
              rows={6}
            />
          )}
          {postRespError && <p className="text-xs text-red-500">Invalid JSON</p>}
        </div>
      </div>

      {/* Cache rules */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Cache Rules</Label>
        {readOnly ? (
          <pre className="font-mono text-xs whitespace-pre-wrap break-words p-3 rounded border bg-muted/30 min-h-[60px]">
            {entry.cache_rules || '—'}
          </pre>
        ) : (
          <Textarea
            value={localCache}
            onChange={(e) => setLocalCache(e.target.value)}
            onBlur={(e) => handleJsonBlur(e.target.value, 'cache_rules', setCacheError)}
            className={cn('font-mono text-xs', cacheError && 'border-red-500')}
            placeholder=""
            rows={3}
          />
        )}
        {cacheError && <p className="text-xs text-red-500">Invalid JSON</p>}
      </div>
    </div>
  );
}
