export interface RouteEntry {
  path: string;
  method: string;
  description: string;
  require_authentication: boolean;
  pre_request_auth_template: string;
  post_response_policy_template: string;
  cache_rules: string;
}

export interface RouteConfig {
  project_id: string;
  api_version: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  routes: RouteEntry[];
}

/** Routes that have user config (require_authentication=false, templates, or cache rules). Default: require_authentication=true, cache_rules=''. */
export function getRoutesWithConfig(routes: RouteEntry[]): RouteEntry[] {
  return routes.filter((r) => {
    const cache = (r.cache_rules?.trim() ?? '');
    const hasCacheConfig = cache.length > 0 && cache !== '{}';
    return (
      r.require_authentication === false ||
      (r.pre_request_auth_template?.trim() ?? '').length > 0 ||
      (r.post_response_policy_template?.trim() ?? '').length > 0 ||
      hasCacheConfig
    );
  });
}

export async function getRouteConfig(
  projectId: string,
  apiVersion: string
): Promise<RouteConfig> {
  const url = `/api/route-configs/${encodeURIComponent(projectId)}/${encodeURIComponent(apiVersion)}`;
  const response = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Failed to fetch route config: ${response.status}`);
  }

  const data = (await response.json()) as RouteConfig | { routes: RouteEntry[] };
  if ('routes' in data && !('project_id' in data)) {
    return {
      project_id: projectId,
      api_version: apiVersion,
      routes: data.routes ?? [],
    };
  }
  return data as RouteConfig;
}

export async function putRouteConfig(
  projectId: string,
  apiVersion: string,
  routes: RouteEntry[]
): Promise<RouteConfig> {
  const toSave = getRoutesWithConfig(routes);
  const results = await Promise.all(
    toSave.map((entry) => putRouteEntry(projectId, apiVersion, entry.path, entry.method, entry))
  );
  return {
    project_id: projectId,
    api_version: apiVersion,
    routes: results,
  };
}

export async function putRouteEntry(
  projectId: string,
  apiVersion: string,
  path: string,
  method: string,
  entry: RouteEntry
): Promise<RouteEntry> {
  const pathEncoded = encodeURIComponent(path);
  const url = `/api/route-configs/${encodeURIComponent(projectId)}/${encodeURIComponent(apiVersion)}/${pathEncoded}/${encodeURIComponent(method)}`;
  const response = await fetch(url, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Failed to save route config: ${response.status}`);
  }

  return response.json() as Promise<RouteEntry>;
}

export async function deleteRouteEntry(
  projectId: string,
  apiVersion: string,
  path: string,
  method: string
): Promise<void> {
  const pathEncoded = encodeURIComponent(path);
  const url = `/api/route-configs/${encodeURIComponent(projectId)}/${encodeURIComponent(apiVersion)}/${pathEncoded}/${encodeURIComponent(method)}`;
  const response = await fetch(url, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok && response.status !== 404) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Failed to delete route config: ${response.status}`);
  }
}
