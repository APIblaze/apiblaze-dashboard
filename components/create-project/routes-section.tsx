'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RoutesTable } from './routes-table';
import { ProjectConfig } from './types';
import type { RouteEntry } from './types';
import { fetchOpenApiSpec } from '@/lib/api/openapi';
import { getRouteConfig } from '@/lib/api/route-configs';
import { FileJson, Loader2, ArrowRight, Info } from 'lucide-react';
import * as yaml from 'js-yaml';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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
  const [spec, setSpec] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
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
    // Skip fetch if routesRef already has data (e.g. after a save that reset config.routeConfig)
    if (projectProp && !config.routeConfig && !routesRefProp?.current?.length) {
      getRouteConfig(projectProp.project_id, projectProp.api_version)
        .then((rc) => {
          if (rc.routes.length > 0) {
            if (routesRefProp) routesRefProp.current = [];
            updateConfig({ routeConfig: { routes: rc.routes } });
          }
        })
        .catch(() => {
          // No existing route config is fine
        });
    }
  }, [projectProp?.project_id, projectProp?.api_version, config.routeConfig, updateConfig, routesRefProp]);

  const showEmptyState =
    !hasSpecSource && !hasUpload && !hasLoadedProject;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Label className="text-base font-semibold">Routes</Label>
          <p className="text-sm text-muted-foreground mt-1">
            Configure per-route settings: require authentication, OpenFGA templates, and cache rules. Expand each resource to edit methods.
          </p>
        </div>
        {config.enforceAuthorization && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="shrink-0 rounded-full p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                aria-label="Authorization info"
              >
                <Info className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-96 text-sm space-y-3 p-5" align="end">
              <p className="font-semibold text-blue-800 dark:text-blue-300">Authorization is enabled</p>
              <p className="text-sm text-muted-foreground">
                Make sure an OpenFGA store and authorization model are configured for this project. Toggle <strong>Enable Authorization</strong> per route, then fill in the policy templates.
              </p>
              <div className="text-xs font-mono text-muted-foreground border rounded p-3 bg-muted/40 leading-6">
                <div>{'{{JWT.sub}}'} · {'{{JWT.email}}'} · {'{{JWT.username}}'}</div>
                <div>{'{{PATH.paramName}}'} · {'{{QUERY.paramName}}'}</div>
                <div>{'{{BODY.field}}'} · {'{{RESPONSE.field}}'}</div>
              </div>
            </PopoverContent>
          </Popover>
        )}
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
          <RoutesTable
            spec={spec}
            existingRoutes={existingRoutes}
            readOnly={false}
            routesRef={routesRefProp}
            enforceAuthorization={config.enforceAuthorization}
          />
        </div>
      )}

      {!showEmptyState && !loading && !error && !spec && hasSpecSource && (
        <p className="text-sm text-muted-foreground">No paths found in the OpenAPI spec.</p>
      )}
    </div>
  );
}
