'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RoutesTable, type RoutesTableRef } from './routes-table';
import { ProjectConfig } from './types';
import type { RouteEntry } from './types';
import { fetchOpenApiSpec } from '@/lib/api/openapi';
import { getRouteConfig, putRouteConfig } from '@/lib/api/route-configs';
import { FileJson, Loader2, ArrowRight, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import * as yaml from 'js-yaml';

interface RoutesSectionProps {
  config: ProjectConfig;
  updateConfig: (updates: Partial<ProjectConfig>) => void;
  onGoToGeneral?: () => void;
  /** When editing an existing project, pass it for spec fetch and route config API */
  project?: { project_id: string; api_version: string } | null;
  /** Ref for parent to read current routes (persists when section unmounts on tab switch) */
  routesRef?: React.MutableRefObject<RouteEntry[]>;
}

function parseUploadedFile(file: File): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const content = reader.result as string;
        const spec =
          file.name.endsWith('.json')
            ? JSON.parse(content)
            : yaml.load(content);
        if (typeof spec !== 'object' || spec === null) {
          reject(new Error('Invalid OpenAPI document'));
        } else {
          resolve(spec as Record<string, unknown>);
        }
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function RoutesSection({
  config,
  updateConfig,
  onGoToGeneral,
  project: projectProp,
  routesRef: routesRefProp,
}: RoutesSectionProps) {
  const { toast } = useToast();
  const [spec, setSpec] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingRoutes = config.routeConfig?.routes ?? [];
  const project = useMemo(
    () =>
      projectProp ??
      (config.projectName && config.apiVersion
        ? { project_id: config.projectName, api_version: config.apiVersion }
        : null),
    [projectProp, config.projectName, config.apiVersion]
  );

  const hasSpecSource =
    config.sourceType === 'github' &&
    config.githubUser &&
    config.githubRepo &&
    config.githubPath;

  const hasUpload = config.sourceType === 'upload' && config.uploadedFile;
  const hasLoadedProject = project && config.projectName;

  const loadSpec = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (config.sourceType === 'github' && hasSpecSource) {
        const res = await fetch('/api/openapi/fetch-full', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner: config.githubUser,
            repo: config.githubRepo,
            path: config.githubPath,
            branch: config.githubBranch || 'main',
          }),
          credentials: 'include',
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || `Failed to fetch spec: ${res.status}`);
        }
        const data = (await res.json()) as { spec: Record<string, unknown> };
        setSpec(data.spec);
      } else if (config.sourceType === 'upload' && config.uploadedFile) {
        const parsed = await parseUploadedFile(config.uploadedFile);
        setSpec(parsed);
      } else if (projectProp) {
        const fetched = (await fetchOpenApiSpec({
          projectId: projectProp.project_id,
          apiVersion: projectProp.api_version,
        })) as Record<string, unknown>;
        setSpec(fetched);
      } else {
        setSpec(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load OpenAPI spec');
      setSpec(null);
    } finally {
      setLoading(false);
    }
  }, [
    config.sourceType,
    config.githubUser,
    config.githubRepo,
    config.githubPath,
    config.githubBranch,
    config.uploadedFile,
    projectProp,
    hasSpecSource,
  ]);

  useEffect(() => {
    if (hasSpecSource || hasUpload || (hasLoadedProject && (projectProp || project))) {
      void loadSpec();
    } else {
      setSpec(null);
      setLoading(false);
      setError(null);
    }
  }, [hasSpecSource, hasUpload, hasLoadedProject, projectProp, project, loadSpec]);

  useEffect(() => {
    if (projectProp && !config.routeConfig && !loading) {
      getRouteConfig(projectProp.project_id, projectProp.api_version)
        .then((rc) => {
          if (rc.routes.length > 0) {
            updateConfig({ routeConfig: { routes: rc.routes } });
          }
        })
        .catch(() => {
          // No existing route config is fine
        });
    }
  }, [projectProp, config.routeConfig, loading, updateConfig]);

  const tableRef = useRef<RoutesTableRef>(null);

  const handleSave = useCallback(async () => {
    if (!projectProp) return;
    const routes = tableRef.current?.getRoutes() ?? [];
    if (routes.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await putRouteConfig(projectProp.project_id, projectProp.api_version, routes);
      updateConfig({ routeConfig: { routes } });
      toast({ title: 'Saved', description: 'Route config saved successfully.' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save route config';
      setError(msg);
      toast({ title: 'Save failed', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [projectProp, updateConfig, toast]);

  const showEmptyState =
    !hasSpecSource && !hasUpload && !hasLoadedProject;

  return (
    <div className="space-y-6">
      <div>
        <Label className="text-base font-semibold">Routes</Label>
        <p className="text-sm text-muted-foreground mt-1">
          Configure per-route settings: require authentication, OpenFGA templates, and cache rules. Expand each resource to edit methods.
        </p>
      </div>

      {showEmptyState && (
        <div className="rounded-lg border border-dashed bg-muted/30 p-12 text-center">
          <FileJson className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-base font-medium mb-2">No OpenAPI spec loaded</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
            Add an OpenAPI spec in the General tab to configure routes. Choose GitHub, upload a file, or load an existing project.
          </p>
          {onGoToGeneral && (
            <Button variant="outline" onClick={onGoToGeneral}>
              Go to General
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {!showEmptyState && loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading OpenAPI spec...
        </div>
      )}

      {!showEmptyState && !loading && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-4">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void loadSpec()}>
            Retry
          </Button>
        </div>
      )}

      {!showEmptyState && !loading && !error && spec && (
        <div className="space-y-4">
          {projectProp && spec && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Routes Config
                  </>
                )}
              </Button>
            </div>
          )}
          <RoutesTable
            ref={tableRef}
            spec={spec}
            existingRoutes={existingRoutes}
            readOnly={false}
            routesRef={routesRefProp}
          />
        </div>
      )}

      {!showEmptyState && !loading && !error && !spec && hasSpecSource && (
        <p className="text-sm text-muted-foreground">No paths found in the OpenAPI spec.</p>
      )}
    </div>
  );
}
