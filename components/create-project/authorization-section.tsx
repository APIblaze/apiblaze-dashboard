'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, ShieldOff, AlertCircle, Loader2,
  ChevronDown, ChevronRight, Save, Edit2, RefreshCw, TriangleAlert,
  ArrowRight, Check, Circle, Sparkles,
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
  onRelationsChange?: (relations: string[]) => void;
  onTypesChange?: (types: string[]) => void;
  onGoToRoutes?: () => void;
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

// ─── Setup Tracker ────────────────────────────────────────────────────────────

interface StepProps {
  num: number;
  done: boolean;
  active: boolean;
  label: string;
  sub: string;
}

function Step({ num, done, active, label, sub }: StepProps) {
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0 flex-1 text-center">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-500 shrink-0 ${
          done
            ? 'bg-green-500 text-white shadow-sm shadow-green-200 dark:shadow-green-900'
            : active
            ? 'bg-blue-500 text-white shadow-sm shadow-blue-200 dark:shadow-blue-900 ring-4 ring-blue-100 dark:ring-blue-900/50'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {done ? <Check className="w-4 h-4" /> : num}
      </div>
      <div>
        <p className={`text-xs font-semibold leading-tight transition-colors duration-300 ${done ? 'text-green-700 dark:text-green-400' : active ? 'text-blue-700 dark:text-blue-400' : 'text-muted-foreground'}`}>
          {label}
        </p>
        <p className={`text-xs leading-tight mt-0.5 transition-colors duration-300 ${done ? 'text-green-600/80 dark:text-green-500/70' : active ? 'text-blue-600/80 dark:text-blue-500/70' : 'text-muted-foreground/60'}`}>
          {sub}
        </p>
      </div>
    </div>
  );
}

function SetupTracker({
  step1Done,
  step2Done,
  step3Done,
  coveredRoutes,
  totalRoutes,
}: {
  step1Done: boolean;
  step2Done: boolean;
  step3Done: boolean;
  coveredRoutes: number;
  totalRoutes: number;
}) {
  const allDone = step1Done && step2Done && step3Done;
  const active1 = !step1Done;
  const active2 = step1Done && !step2Done;
  const active3 = step1Done && step2Done && !step3Done;

  return (
    <div>
      {allDone ? (
        <div className="rounded-xl border border-green-200 dark:border-green-800 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/30 px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center shrink-0 shadow shadow-green-200 dark:shadow-green-900">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-green-800 dark:text-green-300">Your API is protected</p>
            <p className="text-xs text-green-700/70 dark:text-green-400/70">
              {coveredRoutes} of {totalRoutes} routes have check rules — enforcement is on.
            </p>
          </div>
          <Sparkles className="w-4 h-4 text-green-400 ml-auto shrink-0" />
        </div>
      ) : (
        <div className="rounded-xl border border-blue-200/70 dark:border-blue-800/50 bg-gradient-to-br from-blue-50 via-indigo-50/60 to-violet-50/30 dark:from-blue-950/40 dark:via-indigo-950/20 dark:to-violet-950/10 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-blue-500/20 dark:bg-blue-500/30 flex items-center justify-center">
              <ShieldCheck className="w-3 h-3 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">Protect your API in 3 steps</p>
          </div>

          <div className="flex items-center gap-1">
            <Step num={1} done={step1Done} active={active1} label="Define your model" sub={step1Done ? 'Model ready' : 'No model yet'} />
            <ArrowRight className={`w-4 h-4 shrink-0 mb-4 transition-colors duration-500 ${step1Done ? 'text-green-400' : 'text-blue-300 dark:text-blue-700'}`} />
            <Step num={2} done={step2Done} active={active2} label="Add route rules" sub={totalRoutes === 0 ? 'No routes yet' : `${coveredRoutes} / ${totalRoutes} routes`} />
            <ArrowRight className={`w-4 h-4 shrink-0 mb-4 transition-colors duration-500 ${step2Done ? 'text-green-400' : step1Done ? 'text-blue-300 dark:text-blue-700' : 'text-muted-foreground/30'}`} />
            <Step num={3} done={step3Done} active={active3} label="Enable enforcement" sub={step3Done ? 'On' : 'Off'} />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-blue-200/40 dark:border-blue-800/30">
            <span className="text-xs text-blue-600/60 dark:text-blue-400/50 shrink-0">Placeholders:</span>
            {['{{JWT.sub}}', '{{PATH.id}}', '{{BODY.field}}', '{{RESPONSE.id}}', '{{QUERY.key}}'].map((p) => (
              <code key={p} className="text-xs bg-blue-100/80 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded px-1.5 py-0.5">{p}</code>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tuple Chip ───────────────────────────────────────────────────────────────

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

// ─── Route Row ────────────────────────────────────────────────────────────────

function RouteRow({ route, enforced }: { route: RouteEntry; enforced: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const hasCheck = (route.pre_request_auth_template?.trim() ?? '') !== '';
  const hasWrite = (route.post_response_policy_template?.trim() ?? '') !== '';
  const hasPolicy = hasCheck || hasWrite;
  const willDeny = enforced && route.authorization_enabled && !hasPolicy;

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
          {hasCheck && <Badge variant="secondary" className="text-xs">check</Badge>}
          {hasWrite && <Badge variant="secondary" className="text-xs">write</Badge>}
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
          {hasPolicy && <ShieldCheck className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />}
        </div>
      </button>

      {expanded && hasPolicy && (
        <div className="px-4 pb-3 space-y-2 border-t">
          {hasCheck && (
            <TupleChip
              template={route.pre_request_auth_template}
              label="Check rule — runs before request, blocks if denied"
            />
          )}
          {hasWrite && (
            <TupleChip
              template={route.post_response_policy_template}
              label="Write rule — runs after success, records who owns what"
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Model Viewer ─────────────────────────────────────────────────────────────

interface TypeDef {
  type: string;
  relations?: Record<string, unknown>;
}

type RelationTag = { label: string; kind: 'direct' | 'inherits' | 'computed' };

function getRelationTags(def: unknown): RelationTag[] {
  if (!def || typeof def !== 'object') return [{ label: 'direct', kind: 'direct' }];
  const d = def as Record<string, unknown>;
  if ('this' in d) return [{ label: 'direct', kind: 'direct' }];
  if ('computedUserset' in d) {
    const cu = d.computedUserset as Record<string, unknown>;
    return [{ label: String(cu.relation ?? '?'), kind: 'inherits' }];
  }
  if ('tupleToUserset' in d) {
    const ttu = d.tupleToUserset as Record<string, unknown>;
    const cs = ttu.computedUserset as Record<string, unknown> | undefined;
    return [{ label: `via ${cs?.relation ?? '?'}`, kind: 'computed' }];
  }
  if ('union' in d) {
    const children = ((d.union as Record<string, unknown>).child as unknown[]) ?? [];
    return children.flatMap(getRelationTags);
  }
  if ('intersection' in d) {
    const children = ((d.intersection as Record<string, unknown>).child as unknown[]) ?? [];
    return children.flatMap(getRelationTags);
  }
  return [{ label: 'custom', kind: 'computed' }];
}

function RelationTagBadge({ tag }: { tag: RelationTag }) {
  if (tag.kind === 'direct') {
    return (
      <span title="Can be assigned directly to a user" className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border border-green-200 dark:border-green-800">
        assignable
      </span>
    );
  }
  if (tag.kind === 'inherits') {
    return (
      <span title={`Also granted to anyone who has the '${tag.label}' relation`} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
        also granted to: {tag.label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
      {tag.label}
    </span>
  );
}

function ModelViewer({ model }: { model: OpenFGAModel }) {
  const [expanded, setExpanded] = useState(false);
  const types = (model.type_definitions ?? []) as TypeDef[];
  const visible = types.filter(t => Object.keys(t.relations ?? {}).length > 0);

  if (visible.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No types defined yet.</p>;
  }

  return (
    <div className="space-y-2">
      {/* Compact summary — always visible */}
      <div className="rounded-md border overflow-hidden divide-y">
        {visible.map((typeDef) => {
          const relationEntries = Object.entries(typeDef.relations ?? {});
          return (
            <div key={typeDef.type} className="flex items-center gap-3 px-3 py-2">
              <span className="text-xs font-mono font-semibold text-foreground shrink-0 w-20 truncate">{typeDef.type}</span>
              <div className="flex flex-wrap gap-1 min-w-0">
                {relationEntries.map(([rel, def]) => {
                  const tags = getRelationTags(def);
                  const hasInherits = tags.some(t => t.kind === 'inherits');
                  const hasDirect = tags.some(t => t.kind === 'direct');
                  const chipClass = hasInherits && hasDirect
                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                    : hasInherits
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                    : hasDirect
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
                  return (
                    <span key={rel} className={`text-xs font-mono rounded px-1.5 py-0.5 ${chipClass}`}>{rel}</span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Color legend */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />assignable
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />inherited
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />both
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />computed
        </span>
      </div>

      {/* Expand toggle */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {expanded ? 'Hide' : 'Show'} relation details
        <span className="text-muted-foreground/50 ml-1">· schema {model.schema_version}</span>
      </button>

      {/* Full detail — expanded only */}
      {expanded && (
        <div className="space-y-2">
          {visible.map((typeDef) => {
            const relations = Object.entries(typeDef.relations ?? {});
            return (
              <div key={typeDef.type} className="rounded-md border overflow-hidden">
                <div className="px-3 py-2 bg-muted/50 border-b flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-foreground">{typeDef.type}</span>
                </div>
                <div className="divide-y">
                  {relations.map(([rel, def]) => {
                    const tags = getRelationTags(def);
                    return (
                      <div key={rel} className="flex items-center gap-3 px-3 py-2">
                        <span className="text-xs font-mono font-medium text-foreground shrink-0 w-24 truncate">{rel}</span>
                        <div className="flex flex-wrap gap-1">
                          {tags.map((tag, i) => (
                            <RelationTagBadge key={i} tag={tag} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Model Card ───────────────────────────────────────────────────────────────

function ModelCard({ project, onModelChange, onRelationsChange, onTypesChange }: { project: Project; onModelChange: (exists: boolean) => void; onRelationsChange?: (relations: string[]) => void; onTypesChange?: (types: string[]) => void }) {
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
      const res = await fetch(url, { cache: 'no-store' });
      if (res.status === 404) {
        setModel(null);
        onModelChange(false);
      } else if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setError(err.error ?? `Error ${res.status}`);
      } else {
        const data = await res.json() as { model: OpenFGAModel };
        setModel(data.model);
        onModelChange(true);
        const typeDefs = (data.model.type_definitions ?? []) as Array<{ type?: string; relations?: Record<string, unknown> }>;
        if (onRelationsChange) {
          const relations = [...new Set(typeDefs.flatMap(td => Object.keys(td.relations ?? {})))];
          onRelationsChange(relations);
        }
        if (onTypesChange) {
          const types = typeDefs.map(td => td.type ?? '').filter(t => t && t !== 'user');
          onTypesChange(types);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load model');
    } finally {
      setLoading(false);
    }
  }, [project.project_id, project.api_version, tenantId, onModelChange]);

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
      const url = policiesApiUrl(project.project_id, project.api_version, 'model') +
        `&tenantId=${encodeURIComponent(tenantId)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const data = await res.json().catch(() => ({})) as {
        error?: string;
        failed_count?: number;
        updated_count?: number;
        tenants?: { tenantId: string; status: string; error?: string }[];
      };
      if (!res.ok) {
        throw new Error(data.error ?? `Error ${res.status}`);
      }
      // 207 = partial/full failure — backend still returns 2xx but some tenants failed
      if (res.status === 207 || (data.failed_count ?? 0) > 0) {
        const detail = data.tenants?.find(t => t.status === 'failed')?.error ?? 'Model rejected by authorization service';
        throw new Error(detail);
      }
      if ((data.updated_count ?? 0) === 0) {
        toast({ title: 'No changes', description: 'Model is already up to date.' });
      } else {
        toast({ title: 'Model saved', description: 'Authorization model updated.' });
      }
      setEditing(false);
      await loadModel();
    } catch (e) {
      toast({ title: 'Save failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-l-4 border-l-blue-400 dark:border-l-blue-600">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 text-xs font-bold flex items-center justify-center shrink-0">1</span>
              <CardTitle className="text-base">Authorization Model</CardTitle>
            </div>
            <CardDescription>
              The schema for your permission system — defines types of users, resources, and the
              relationships between them. e.g. <em>"a user can be an owner or viewer of a document."</em>
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
          <div className="space-y-2 py-1 animate-pulse">
            <div className="h-3 bg-muted rounded w-3/4" />
            <div className="h-3 bg-muted rounded w-1/2" />
            <div className="h-3 bg-muted rounded w-2/3" />
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 text-destructive py-4">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}
        {!loading && !error && !editing && !model && (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20 p-4">
            <Circle className="w-4 h-4 text-blue-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">No model yet</p>
              <p className="text-xs text-blue-600/70 dark:text-blue-400/60">Click <strong>Add Model</strong> to define your permission types and start step 1.</p>
            </div>
          </div>
        )}
        {!loading && !error && !editing && model && (
          <ModelViewer model={model} />
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
  onGoToRoutes,
}: {
  routes: RouteEntry[];
  loading: boolean;
  error: string | null;
  enforced: boolean;
  onGoToRoutes?: () => void;
}) {
  const protected_ = routes.filter((r) => !hasNoPolicy(r));
  const unprotected = routes.filter(hasNoPolicy);

  return (
    <Card className="border-l-4 border-l-indigo-400 dark:border-l-indigo-600">
      <CardHeader>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center shrink-0">2</span>
              <CardTitle className="text-base">Route Rules</CardTitle>
            </div>
            <CardDescription>
              Per-route rules decide who can access what.{' '}
              {onGoToRoutes ? (
                <button type="button" onClick={onGoToRoutes} className="underline underline-offset-2 hover:text-foreground transition-colors">
                  Go to Routes tab
                </button>
              ) : (
                <span>Configure them in the <strong>Routes</strong> tab</span>
              )}
              {' '}to add check and write rules, then come back here to see coverage.
            </CardDescription>
          </div>
          {!loading && routes.length > 0 && (
            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <ShieldCheck className="w-4 h-4" />
                {protected_.length} covered
              </span>
              {unprotected.length > 0 && (
                <span className={`flex items-center gap-1 ${enforced ? 'text-orange-500 dark:text-orange-400' : 'text-muted-foreground'}`}>
                  <ShieldOff className="w-4 h-4" />
                  {unprotected.length} open
                </span>
              )}
            </div>
          )}
        </div>
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
            No routes configured. Add routes in the <strong>Routes</strong> tab first.
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

  return (
    <Card className="border-l-4 border-l-violet-400 dark:border-l-violet-600">
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900 text-violet-600 dark:text-violet-400 text-xs font-bold flex items-center justify-center shrink-0">3</span>
              <CardTitle className="text-base">Enforce Authorization</CardTitle>
            </div>
            <CardDescription>
              Master switch. When on, protected routes are checked against your model before
              the request goes through. Routes not marked as protected are always allowed.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <Switch
              id="enforce-auth"
              checked={enforceAuthorization}
              onCheckedChange={(checked) => updateConfig({ enforceAuthorization: checked })}
            />
            <Label htmlFor="enforce-auth" className="text-sm font-medium cursor-pointer">
              {enforceAuthorization ? 'On' : 'Off'}
            </Label>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {!routesLoading && routes.length > 0 && enforceAuthorization && (
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                <ShieldCheck className="w-4 h-4" />
                {coveredCount} / {routes.length} routes covered
              </span>
              {uncoveredCount > 0 && (
                <span className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400">
                  <ShieldOff className="w-4 h-4" />
                  {uncoveredCount} missing {uncoveredCount === 1 ? 'rule' : 'rules'}
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
            Refresh
          </Button>
        </div>

        {enforceAuthorization && uncoveredCount > 0 && !routesLoading && (
          <div className="flex items-start gap-2 text-sm text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 rounded-lg p-3">
            <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              <strong>{uncoveredCount} protected {uncoveredCount === 1 ? 'route has' : 'routes have'} no check rule</strong>
              {' '}and will be denied. Add a <strong>Check rule</strong> in the{' '}
              <strong>Routes</strong> tab, or turn off "Protected Route" on that route.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function AuthorizationSection({ project, config, updateConfig, onRelationsChange, onTypesChange, onGoToRoutes }: AuthorizationSectionProps) {
  const [routes, setRoutes] = useState<RouteEntry[]>([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routesError, setRoutesError] = useState<string | null>(null);
  const [modelExists, setModelExists] = useState(false);

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

  // Derived for tracker
  const coveredRoutes = routes.filter((r) => !hasNoPolicy(r)).length;
  const hasRouteRules = coveredRoutes > 0;

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
            Deploy first, then configure per-route access rules here.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <SetupTracker
        step1Done={modelExists}
        step2Done={hasRouteRules}
        step3Done={config.enforceAuthorization}
        coveredRoutes={coveredRoutes}
        totalRoutes={routes.length}
      />

      <ModelCard
        project={project}
        onModelChange={setModelExists}
        onRelationsChange={onRelationsChange}
        onTypesChange={onTypesChange}
      />

      <RouteCoverageCard
        routes={routes}
        loading={routesLoading}
        error={routesError}
        enforced={config.enforceAuthorization}
        onGoToRoutes={onGoToRoutes}
      />

      <EnforcementCard
        enforceAuthorization={config.enforceAuthorization}
        updateConfig={updateConfig}
        routes={routes}
        routesLoading={routesLoading}
        onRefreshRoutes={() => void loadRoutes(project)}
      />
    </div>
  );
}
