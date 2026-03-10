'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, ShieldOff, AlertCircle, Loader2, Info,
  ChevronDown, ChevronRight, Save, Edit2, RefreshCw, TriangleAlert,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { getRouteConfig } from '@/lib/api/route-configs';
import type { RouteEntry } from '@/lib/api/route-configs';
import type { Project } from '@/types/project';
import { useToast } from '@/hooks/use-toast';
import type { ProjectConfig } from './types';

interface AuthorizationSectionProps {
  project: Project | null;
  config: ProjectConfig;
  updateConfig: (updates: Partial<ProjectConfig>) => void;
  onProjectUpdate?: (updated: Project) => void;
}

interface ParsedTuple {
  user: string;
  relation: string;
  object: string;
}

interface OpenFGAModel {
  id: string;
  schema_version: string;
  type_definitions: unknown[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hasNoPolicy(route: RouteEntry): boolean {
  return (
    (route.pre_request_auth_template?.trim() ?? '') === '' &&
    (route.post_response_policy_template?.trim() ?? '') === ''
  );
}


function parseTuple(template: string): ParsedTuple | null {
  try {
    const parsed = JSON.parse(template);
    if (
      parsed &&
      typeof parsed.user === 'string' &&
      typeof parsed.relation === 'string' &&
      typeof parsed.object === 'string'
    ) {
      return parsed as ParsedTuple;
    }
  } catch {
    // not JSON — show raw
  }
  return null;
}

function getTenantId(project: Project): string {
  const cfg = project.config as Record<string, unknown> | undefined;
  return (cfg?.default_tenant as string) || 'api';
}

const POLICIES_API_DOMAIN =
  process.env.NEXT_PUBLIC_POLICIES_API_DOMAIN || 'policies.apiblaze.com';

function policiesApiUrl(projectId: string, apiVersion: string, path: string): string {
  return `https://${projectId}.${POLICIES_API_DOMAIN}/${path}?api_version=${encodeURIComponent(apiVersion)}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TupleChip({ template, label }: { template: string; label: string }) {
  const tuple = parseTuple(template);
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      {tuple ? (
        <div className="flex flex-wrap items-center gap-1 text-xs font-mono bg-muted rounded-md px-2 py-1.5">
          <span className="text-blue-600 dark:text-blue-400">{tuple.user}</span>
          <span className="text-muted-foreground mx-1">→</span>
          <span className="text-amber-600 dark:text-amber-400">{tuple.relation}</span>
          <span className="text-muted-foreground mx-1">→</span>
          <span className="text-green-600 dark:text-green-400">{tuple.object}</span>
        </div>
      ) : (
        <p className="text-xs font-mono bg-muted rounded-md px-2 py-1.5 break-all">{template}</p>
      )}
    </div>
  );
}

function RouteRow({ route, enforced }: { route: RouteEntry; enforced: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const hasCheck = (route.pre_request_auth_template?.trim() ?? '') !== '';
  const hasWrite = (route.post_response_policy_template?.trim() ?? '') !== '';
  const hasPolicy = hasCheck || hasWrite;
  const willDeny = enforced && !hasPolicy;

  return (
    <div
      className={`border rounded-lg transition-colors ${
        hasPolicy
          ? 'border-green-200 dark:border-green-900 bg-green-50/40 dark:bg-green-950/20'
          : willDeny
          ? 'border-orange-200 dark:border-orange-900 bg-orange-50/40 dark:bg-orange-950/20'
          : 'border-border bg-muted/20'
      }`}
    >
      <button
        type="button"
        onClick={() => hasPolicy && setExpanded((e) => !e)}
        className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left ${hasPolicy ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {hasPolicy ? (
            expanded ? (
              <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            )
          ) : (
            <span className="w-3.5 h-3.5 shrink-0" />
          )}
          <Badge variant="outline" className="text-xs font-mono shrink-0">
            {route.method}
          </Badge>
          <span className="text-sm font-mono truncate">{route.path}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {hasCheck && (
            <Badge variant="secondary" className="text-xs">check</Badge>
          )}
          {hasWrite && (
            <Badge variant="secondary" className="text-xs">write</Badge>
          )}
          {!hasPolicy && willDeny && (
            <span className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1">
              <TriangleAlert className="w-3.5 h-3.5" />
              will be denied
            </span>
          )}
          {!hasPolicy && !willDeny && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <ShieldOff className="w-3.5 h-3.5" />
              unprotected
            </span>
          )}
          {hasPolicy && (
            <ShieldCheck className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
          )}
        </div>
      </button>

      {expanded && hasPolicy && (
        <div className="px-4 pb-3 space-y-2 border-t">
          {hasCheck && (
            <TupleChip
              template={route.pre_request_auth_template}
              label="Pre-request check (on_request_read)"
            />
          )}
          {hasWrite && (
            <TupleChip
              template={route.post_response_policy_template}
              label="Post-response write (post_response_write)"
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Enforcement Card ─────────────────────────────────────────────────────────

function EnforcementCard({
  enforceAuthorization,
  updateConfig,
  routes,
  routesLoading,
  onRefreshRoutes,
}: {
  enforceAuthorization: boolean;
  updateConfig: (updates: Partial<ProjectConfig>) => void;
  routes: RouteEntry[];
  routesLoading: boolean;
  onRefreshRoutes: () => void;
}) {
  const uncoveredCount = routes.filter(hasNoPolicy).length;
  const coveredCount = routes.length - uncoveredCount;

  const handleToggle = (checked: boolean) => {
    updateConfig({ enforceAuthorization: checked });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="text-base">Enforce Authorization</CardTitle>
            <CardDescription>
              When enabled, any route without an authorization policy will be denied automatically.
            </CardDescription>
          </div>
          <div className="flex items-center gap-3 pt-0.5">
            <div className="flex items-center gap-2">
              <Switch
                id="enforce-auth"
                checked={enforceAuthorization}
                onCheckedChange={handleToggle}
              />
              <Label htmlFor="enforce-auth" className="text-sm font-medium cursor-pointer">
                {enforceAuthorization ? 'On' : 'Off'}
              </Label>
            </div>
          </div>
        </div>
      </CardHeader>

      {/* Coverage summary */}
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {!routesLoading && routes.length > 0 && enforceAuthorization && (
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                <ShieldCheck className="w-4 h-4" />
                <span>{coveredCount} / {routes.length} routes covered</span>
              </span>
              {uncoveredCount > 0 && (
                <span className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400">
                  <ShieldOff className="w-4 h-4" />
                  <span>{uncoveredCount} missing {uncoveredCount === 1 ? 'policy' : 'policies'}</span>
                </span>
              )}
            </div>
          )}
          {routesLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Checking routes...
            </div>
          )}
          {!routesLoading && routes.length === 0 && (
            <span className="text-sm text-muted-foreground">No routes found.</span>
          )}
          <Button variant="outline" size="sm" onClick={onRefreshRoutes} disabled={routesLoading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${routesLoading ? 'animate-spin' : ''}`} />
            Check Coverage
          </Button>
        </div>

        {/* Warning banner: only shown when enforced AND gaps exist */}
        {enforceAuthorization && uncoveredCount > 0 && !routesLoading && (
          <div className="flex items-start gap-2 text-sm text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 rounded-lg p-3">
            <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              <strong>{uncoveredCount} {uncoveredCount === 1 ? 'route has' : 'routes have'} no authorization policy</strong>
              {' '}and will be denied. Add{' '}
              <strong>on_request_read</strong> or <strong>post_response_write</strong> tuples in
              the <strong>Routes</strong> tab, or turn off enforcement to allow them through.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Model Card ───────────────────────────────────────────────────────────────

function ModelCard({ project }: { project: Project }) {
  const { toast } = useToast();
  const tenantId = getTenantId(project);

  const [model, setModel] = useState<OpenFGAModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftJson, setDraftJson] = useState('');
  const [saving, setSaving] = useState(false);

  const loadModel = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url =
        policiesApiUrl(project.project_id, project.api_version, 'model') +
        `&tenantId=${encodeURIComponent(tenantId)}`;
      const res = await fetch(url);
      if (res.status === 404) {
        setModel(null);
      } else if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setError(err.error ?? `Error ${res.status}`);
      } else {
        const data = await res.json() as { model: OpenFGAModel };
        setModel(data.model);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load model');
    } finally {
      setLoading(false);
    }
  }, [project.project_id, project.api_version, tenantId]);

  useEffect(() => { void loadModel(); }, [loadModel]);

  const handleEdit = () => {
    setDraftJson(
      model
        ? JSON.stringify({ schema_version: model.schema_version, type_definitions: model.type_definitions }, null, 2)
        : JSON.stringify({ schema_version: '1.1', type_definitions: [] }, null, 2)
    );
    setEditing(true);
  };

  const handleSave = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draftJson);
    } catch {
      toast({ title: 'Invalid JSON', description: 'Check your model JSON syntax.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const url = policiesApiUrl(project.project_id, project.api_version, 'model');
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Error ${res.status}`);
      }
      toast({ title: 'Model saved', description: 'Authorization model updated across all tenants.' });
      setEditing(false);
      await loadModel();
    } catch (e) {
      toast({ title: 'Save failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Authorization Model</CardTitle>
            <CardDescription>
              OpenFGA type definitions — declares the user, resource, and relation types for your API.
            </CardDescription>
          </div>
          {!loading && !editing && (
            <Button variant="outline" size="sm" onClick={handleEdit}>
              <Edit2 className="w-3.5 h-3.5 mr-1.5" />
              {model ? 'Edit' : 'Add Model'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading model...</span>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 text-destructive py-4">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}
        {!loading && !error && !editing && !model && (
          <p className="text-sm text-muted-foreground py-2">
            No authorization model configured. Add one to enable tuple-based access checks.
          </p>
        )}
        {!loading && !error && !editing && model && (
          <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap max-h-64">
            {JSON.stringify({ schema_version: model.schema_version, type_definitions: model.type_definitions }, null, 2)}
          </pre>
        )}
        {editing && (
          <div className="space-y-3">
            <Textarea
              value={draftJson}
              onChange={(e) => setDraftJson(e.target.value)}
              className="font-mono text-xs min-h-64 resize-y"
              placeholder='{ "schema_version": "1.1", "type_definitions": [...] }'
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                Save Model
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Route Coverage Card ──────────────────────────────────────────────────────

function RouteCoverageCard({
  routes,
  loading,
  error,
  enforced,
}: {
  routes: RouteEntry[];
  loading: boolean;
  error: string | null;
  enforced: boolean;
}) {
  const protected_ = routes.filter((r) => !hasNoPolicy(r));
  const unprotected = routes.filter(hasNoPolicy);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
          <span>Route Coverage</span>
          {!loading && routes.length > 0 && (
            <div className="flex items-center gap-3 text-sm font-normal text-muted-foreground">
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <ShieldCheck className="w-4 h-4" />
                {protected_.length} protected
              </span>
              {unprotected.length > 0 && (
                <span className={`flex items-center gap-1 ${enforced ? 'text-orange-600 dark:text-orange-400' : ''}`}>
                  <ShieldOff className="w-4 h-4" />
                  {unprotected.length} unprotected
                </span>
              )}
            </div>
          )}
        </CardTitle>
        <CardDescription>
          Each route from your RouteConfig is listed here. Configure{' '}
          <strong>on_request_read</strong> and <strong>post_response_write</strong> tuples
          in the <strong>Routes</strong> tab.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading routes...</span>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 text-destructive py-4">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}
        {!loading && !error && routes.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">
            No routes configured. Add routes in the <strong>Routes</strong> tab to check authorization coverage.
          </p>
        )}
        {!loading && !error && routes.length > 0 && (
          <div className="space-y-1.5">
            {[...protected_, ...unprotected].map((route, i) => (
              <RouteRow key={`${route.method}-${route.path}-${i}`} route={route} enforced={enforced} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function AuthorizationSection({ project, config, updateConfig, onProjectUpdate }: AuthorizationSectionProps) {
  // Shared route state — lifted so EnforcementCard and RouteCoverageCard share the same data
  const [routes, setRoutes] = useState<RouteEntry[]>([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routesError, setRoutesError] = useState<string | null>(null);

  const loadRoutes = useCallback(async (proj: Project) => {
    setRoutesLoading(true);
    setRoutesError(null);
    try {
      const cfg = await getRouteConfig(proj.project_id, proj.api_version);
      setRoutes(cfg.routes ?? []);
    } catch (e) {
      setRoutesError(e instanceof Error ? e.message : 'Failed to load routes');
    } finally {
      setRoutesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (project) void loadRoutes(project);
  }, [project, loadRoutes]);

  if (!project) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            Authorization
          </CardTitle>
          <CardDescription>
            Fine-grained authorization is available after deploying your project.
            Deploy first, then configure per-route OpenFGA policies here.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3 border">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          Tuple templates are resolved at runtime by the proxy. Supported placeholders:{' '}
          <code className="text-xs bg-background rounded px-1">{'{{JWT.sub}}'}</code>{' '}
          <code className="text-xs bg-background rounded px-1">{'{{PATH.param}}'}</code>{' '}
          <code className="text-xs bg-background rounded px-1">{'{{QUERY.key}}'}</code>{' '}
          <code className="text-xs bg-background rounded px-1">{'{{BODY.field}}'}</code>{' '}
          <code className="text-xs bg-background rounded px-1">{'{{RESPONSE.field}}'}</code>
        </span>
      </div>

      <EnforcementCard
        enforceAuthorization={config.enforceAuthorization}
        updateConfig={updateConfig}
        routes={routes}
        routesLoading={routesLoading}
        onRefreshRoutes={() => void loadRoutes(project)}
      />

      <ModelCard project={project} />

      <RouteCoverageCard
        routes={routes}
        loading={routesLoading}
        error={routesError}
        enforced={config.enforceAuthorization}
      />
    </div>
  );
}
