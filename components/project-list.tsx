'use client';

import { useCallback, useState, useImperativeHandle, forwardRef } from 'react';
import { Project } from '@/types/project';
import { ProjectCard } from '@/components/project-card';
import { deleteProject } from '@/lib/api/projects';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDashboardCacheStore } from '@/store/dashboard-cache';

interface ProjectListProps {
  teamId?: string;
  onUpdateConfig?: (project: Project) => void;
  onDelete?: (project: Project) => void;
  onRefresh?: () => void;
  onNewProject?: () => void;
}

export interface ProjectListRef {
  refresh: () => Promise<void>;
}

export const ProjectList = forwardRef<ProjectListRef, ProjectListProps>(
  ({ teamId, onUpdateConfig, onDelete: onDeleteCallback, onRefresh, onNewProject }, ref) => {
    const projects = useDashboardCacheStore((s) => s.projects);
    const isBootstrapping = useDashboardCacheStore((s) => s.isBootstrapping);
    const error = useDashboardCacheStore((s) => s.error);
    const invalidateAndRefetch = useDashboardCacheStore((s) => s.invalidateAndRefetch);

    const [refreshing, setRefreshing] = useState(false);
    const { toast } = useToast();
    const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const refresh = useCallback(async () => {
      setRefreshing(true);
      try {
        await invalidateAndRefetch(teamId);
        onRefresh?.();
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to refresh';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
      } finally {
        setRefreshing(false);
      }
    }, [teamId, invalidateAndRefetch, onRefresh, toast]);

    useImperativeHandle(ref, () => ({
      refresh,
    }));

    const handleRefresh = async () => {
      await refresh();
    };

    const handleDeleteRequest = (project: Project) => {
      setProjectToDelete(project);
      setDeleteDialogOpen(true);
    };

    const closeDeleteDialog = () => {
      if (deleting) return;
      setDeleteDialogOpen(false);
      setProjectToDelete(null);
    };

    const handleDeleteConfirm = async () => {
      if (!projectToDelete) return;
      try {
        setDeleting(true);
        await deleteProject(projectToDelete.project_id, projectToDelete.api_version);
        await invalidateAndRefetch(teamId);
        toast({
          title: 'Project deleted',
          description: `${projectToDelete.display_name} has been removed.`,
        });
        onDeleteCallback?.(projectToDelete);
        onRefresh?.();
        closeDeleteDialog();
      } catch (err: unknown) {
        console.error('Error deleting project:', err);
        const message =
          err instanceof Error ? err.message : 'An unexpected error occurred while deleting the project.';
        toast({
          title: 'Failed to delete project',
          description: message,
          variant: 'destructive',
        });
      } finally {
        setDeleting(false);
      }
    };

    const handleDialogOpenChange = (open: boolean) => {
      if (!open) closeDeleteDialog();
      else if (projectToDelete) setDeleteDialogOpen(true);
    };

    const loading = isBootstrapping && projects.length === 0;

    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (error && projects.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <p className="text-muted-foreground">{error}</p>
          <Button onClick={() => invalidateAndRefetch(teamId)} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </div>
      );
    }

    return (
      <>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Your Projects</h2>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={onNewProject}>
                <Plus className="mr-2 h-4 w-4" />
                New project
              </Button>
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <ProjectCard
                key={project.project_id}
                project={project}
                onUpdateConfig={onUpdateConfig}
                onDelete={handleDeleteRequest}
              />
            ))}
          </div>
        </div>

        <Dialog open={deleteDialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete project?</DialogTitle>
              <DialogDescription>
                This action cannot be undone.{' '}
                {projectToDelete
                  ? `${projectToDelete.display_name} (${projectToDelete.project_id})`
                  : 'This project'}{' '}
                will be removed.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={closeDeleteDialog} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleting}>
                {deleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting…
                  </>
                ) : (
                  'Delete Project'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }
);

ProjectList.displayName = 'ProjectList';
