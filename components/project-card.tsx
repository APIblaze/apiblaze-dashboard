'use client';

import { useMemo, useEffect } from 'react';
import Image from 'next/image';
import { Project } from '@/types/project';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DeploymentStatus } from '@/components/deployment-status';
import { ExternalLink, Settings, Trash2, Github, Globe, Loader2, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical } from 'lucide-react';
import { useDashboardCacheStore } from '@/store/dashboard-cache';
import type { AppClient } from '@/types/auth-config';

interface ProjectCardProps {
  project: Project;
  onUpdateConfig?: (project: Project) => void;
  onDelete?: (project: Project) => void;
}

function useProjectAuth(project: Project) {
  const getAuthConfigs = useDashboardCacheStore((s) => s.getAuthConfigs);
  const getAuthConfig = useDashboardCacheStore((s) => s.getAuthConfig);
  const getAppClients = useDashboardCacheStore((s) => s.getAppClients);
  const fetchAppClientsForConfig = useDashboardCacheStore((s) => s.fetchAppClientsForConfig);
  const isBootstrapping = useDashboardCacheStore((s) => s.isBootstrapping);
  const appClientsByConfig = useDashboardCacheStore((s) => s.appClientsByConfig);

  const authConfigIdFromConfig = useMemo(() => {
    const projectConfig = project.config as Record<string, unknown> | undefined;
    return (projectConfig?.auth_config_id || projectConfig?.user_pool_id) as string | undefined;
  }, [project.config]);

  useEffect(() => {
    if (!isBootstrapping && authConfigIdFromConfig) {
      fetchAppClientsForConfig(authConfigIdFromConfig);
    }
  }, [authConfigIdFromConfig, isBootstrapping, fetchAppClientsForConfig]);

  return useMemo(() => {
    const projectConfig = project.config as Record<string, unknown> | undefined;
    let authConfigId = (projectConfig?.auth_config_id || projectConfig?.user_pool_id) as
      | string
      | undefined;
    const defaultAppClientId = (projectConfig?.default_app_client_id ||
      projectConfig?.defaultAppClient) as string | undefined;

    if (!authConfigId && defaultAppClientId) {
      const configs = getAuthConfigs();
      for (const c of configs) {
        const clients = getAppClients(c.id);
        if (clients.some((client) => client.id === defaultAppClientId)) {
          authConfigId = c.id;
          break;
        }
      }
    }

    const authConfig = authConfigId ? getAuthConfig(authConfigId) : undefined;
    const appClients = authConfigId ? getAppClients(authConfigId) : [];
    const bringMyOwnOAuth = !!authConfig?.bringMyOwnOAuth;

    return {
      authConfigId,
      defaultAppClientId,
      appClients,
      bringMyOwnOAuth,
      loadingAppClients: isBootstrapping && !!authConfigId,
    };
  }, [project.config, getAuthConfigs, getAuthConfig, getAppClients, isBootstrapping, appClientsByConfig]);
}

export function ProjectCard({ project, onUpdateConfig, onDelete }: ProjectCardProps) {
  const { appClients, bringMyOwnOAuth, loadingAppClients } = useProjectAuth(project);

  const handleOpenPortal = (appClient?: AppClient) => {
    const projectConfig = project.config as Record<string, unknown> | undefined;
    const defaultAppClientId = (projectConfig?.default_app_client_id ||
      projectConfig?.defaultAppClient) as string | undefined;

    let portalUrl = project.api_version
      ? `${project.urls.portal}/${project.api_version}`
      : project.urls.portal;

    if (appClient) {
      const clientId = (appClient as { client_id?: string; clientId?: string }).client_id ?? appClient.clientId;
      if (clientId) {
        const url = new URL(portalUrl);
        url.pathname = url.pathname.endsWith('/') ? `${url.pathname}login` : `${url.pathname}/login`;
        url.searchParams.set('clientId', clientId);
        portalUrl = url.toString();
      }
    }
    window.open(portalUrl, '_blank');
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="text-xl">{project.display_name}</CardTitle>
              <Badge variant="secondary" className="text-xs">
                v{project.api_version}
              </Badge>
            </div>
            <CardDescription className="font-mono text-xs">
              {project.project_id}.apiblaze.com
            </CardDescription>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onUpdateConfig && (
                <DropdownMenuItem onClick={() => onUpdateConfig(project)}>
                  <Settings className="mr-2 h-4 w-4" />
                  Update Config
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => handleOpenPortal()}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open Portal
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {onDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(project)}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Project
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {project.deployment && (
          <div>
            <DeploymentStatus
              status={project.deployment.status}
              ageSeconds={project.deployment.age_seconds}
              durationSeconds={project.deployment.duration_seconds}
              error={project.deployment.error}
            />
          </div>
        )}

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {project.spec_source.type === 'github' && project.spec_source.github && (
            <div className="flex items-center gap-2">
              <Github className="h-4 w-4" />
              <span className="font-mono text-xs">
                {project.spec_source.github.owner}/{project.spec_source.github.repo}
              </span>
              <Badge variant="outline" className="text-xs">
                {project.spec_source.github.branch}
              </Badge>
            </div>
          )}
          {project.spec_source.type === 'target_only' && (
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              <span className="text-xs">Target URL Only</span>
            </div>
          )}
          {project.spec_source.type === 'upload' && (
            <div className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4" />
              <span className="text-xs">Uploaded Spec</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pt-2 border-t">
          {project.deployer?.avatar_url ? (
            <Image
              src={project.deployer.avatar_url}
              alt={project.deployer.name || project.deployer.github_username || 'User'}
              width={24}
              height={24}
              className="h-6 w-6 rounded-full object-cover"
            />
          ) : (
            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-xs">
              {(project.deployer?.name || project.deployer?.github_username || 'U').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col">
            <span className="text-xs font-medium">
              {project.deployer?.name || project.deployer?.github_username || 'Unknown'}
            </span>
            {project.deployer?.email && (
              <span className="text-xs text-muted-foreground">{project.deployer.email}</span>
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex gap-2">
        {bringMyOwnOAuth && appClients.length > 1 ? (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="flex-1">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Portal
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {loadingAppClients ? (
                  <div className="flex items-center justify-center py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  appClients.map((client) => (
                    <DropdownMenuItem
                      key={client.id}
                      onClick={() => handleOpenPortal(client)}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {client.name}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {onUpdateConfig && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onUpdateConfig(project)}
                className="flex-1"
              >
                <Settings className="mr-2 h-4 w-4" />
                Configure
              </Button>
            )}
          </>
        ) : bringMyOwnOAuth && appClients.length === 1 ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenPortal(appClients[0])}
              className="flex-1"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Portal
            </Button>
            {onUpdateConfig && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onUpdateConfig(project)}
                className="flex-1"
              >
                <Settings className="mr-2 h-4 w-4" />
                Configure
              </Button>
            )}
          </>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenPortal()}
              className="flex-1"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Portal
            </Button>
            {onUpdateConfig && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onUpdateConfig(project)}
                className="flex-1"
              >
                <Settings className="mr-2 h-4 w-4" />
                Configure
              </Button>
            )}
          </>
        )}
      </CardFooter>
    </Card>
  );
}
