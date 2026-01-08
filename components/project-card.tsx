'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Project } from '@/types/project';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DeploymentStatus } from '@/components/deployment-status';
import { ExternalLink, Settings, Trash2, Github, Globe, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical } from 'lucide-react';
import { api } from '@/lib/api';

interface ProjectCardProps {
  project: Project;
  onUpdateConfig?: (project: Project) => void;
  onDelete?: (project: Project) => void;
}

export function ProjectCard({ project, onUpdateConfig, onDelete }: ProjectCardProps) {
  const [loadingClientId, setLoadingClientId] = useState(false);

  const handleOpenPortal = async () => {
    try {
      setLoadingClientId(true);
      
      // Get defaultAppClient and authConfigId from project config
      const projectConfig = project.config as Record<string, unknown> | undefined;
      const defaultAppClientId = (projectConfig?.default_app_client_id || projectConfig?.defaultAppClient) as string | undefined;
      const authConfigId = projectConfig?.auth_config_id as string | undefined;
      
      let portalUrl = project.api_version
        ? `${project.urls.portal}/${project.api_version}`
        : project.urls.portal;
      
      // If we have a default app client, fetch its clientId and add it as a query parameter
      if (defaultAppClientId && authConfigId) {
        try {
          const appClient = await api.getAppClient(authConfigId, defaultAppClientId);
          const clientId = (appClient as { client_id?: string; clientId?: string }).client_id || appClient.clientId;
          
          if (clientId) {
            const url = new URL(portalUrl);
            url.searchParams.set('clientId', clientId);
            portalUrl = url.toString();
          }
        } catch (error) {
          console.error('Error fetching app client details:', error);
          // Continue without clientId if fetch fails
        }
      } else if (defaultAppClientId) {
        // If we have defaultAppClientId but no authConfigId, log a warning
        console.warn('Default app client ID found but no user pool ID', { defaultAppClientId });
      }
      
      window.open(portalUrl, '_blank');
    } catch (error) {
      console.error('Error opening portal:', error);
      // Fallback to opening portal without clientId
      const portalUrl = project.api_version
        ? `${project.urls.portal}/${project.api_version}`
        : project.urls.portal;
      window.open(portalUrl, '_blank');
    } finally {
      setLoadingClientId(false);
    }
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

          {/* Actions menu */}
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
              <DropdownMenuItem onClick={handleOpenPortal} disabled={loadingClientId}>
                {loadingClientId ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="mr-2 h-4 w-4" />
                )}
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
        {/* Deployment Status */}
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

        {/* Source Information */}
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

        {/* Deployer Information */}
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
        <Button variant="outline" size="sm" onClick={handleOpenPortal} className="flex-1" disabled={loadingClientId}>
          {loadingClientId ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ExternalLink className="mr-2 h-4 w-4" />
          )}
          Open Portal
        </Button>
        {onUpdateConfig && (
          <Button variant="outline" size="sm" onClick={() => onUpdateConfig(project)} className="flex-1">
            <Settings className="mr-2 h-4 w-4" />
            Configure
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}