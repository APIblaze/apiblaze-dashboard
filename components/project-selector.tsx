'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, Search, Plus, FolderCog, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useDashboardCacheStore } from '@/store/dashboard-cache';
import type { Project } from '@/types/project';
import { cn } from '@/lib/utils';

export type ProjectSelectorValue =
  | { type: 'team' }
  | { type: 'new' }
  | { type: 'project'; project: Project };

interface ProjectSelectorProps {
  value: ProjectSelectorValue;
  onChange: (value: ProjectSelectorValue) => void;
  teamId?: string;
  /** When team_id is team_{apiBlazeUserId}, show "{githubHandle}'s projects" instead of "Team" */
  githubHandle?: string | null;
  /** session.user.id (apiblazeUserId). If teamId === team_${userId}, use githubHandle for label. */
  userId?: string | null;
  className?: string;
}

function getTeamLabel(teamId?: string, userId?: string | null, githubHandle?: string | null): string {
  const effectiveTeamId = teamId ?? (userId ? `team_${userId}` : undefined);
  const isPersonalTeam = !!effectiveTeamId && !!userId && effectiveTeamId === `team_${userId}`;
  return isPersonalTeam && githubHandle ? `${githubHandle}'s projects` : 'Team';
}

function ProjectDropdownContent({
  value,
  onSelect,
  projects,
  isBootstrapping,
  search,
  onSearchChange,
  inputRef,
  teamId,
  userId,
  githubHandle,
}: {
  value: ProjectSelectorValue;
  onSelect: (v: ProjectSelectorValue) => void;
  projects: Project[];
  isBootstrapping: boolean;
  search: string;
  onSearchChange: (s: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  teamId?: string;
  userId?: string | null;
  githubHandle?: string | null;
}) {
  const filteredProjects = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.toLowerCase().trim();
    return projects.filter(
      (p) =>
        p.display_name.toLowerCase().includes(q) ||
        p.project_id.toLowerCase().includes(q)
    );
  }, [projects, search]);

  return (
    <>
      <div className="border-b p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            placeholder="Search projects..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>
      <div className="max-h-[280px] overflow-y-auto py-1">
        <button
          type="button"
          onClick={() => onSelect({ type: 'team' })}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent rounded-sm transition-colors',
            value.type === 'team' && 'bg-accent'
          )}
        >
          <FolderCog className="h-4 w-4 text-muted-foreground shrink-0" />
          {getTeamLabel(teamId, userId, githubHandle)}
        </button>
        <div className="border-t my-1" />
        {isBootstrapping && projects.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground text-center">
            Loading projects...
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground text-center">
            {search ? 'No projects match your search.' : 'No projects yet.'}
          </div>
        ) : (
          filteredProjects.map((project) => (
            <button
              key={project.project_id}
              type="button"
              onClick={() => onSelect({ type: 'project', project })}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent rounded-sm transition-colors',
                value.type === 'project' &&
                  value.project.project_id === project.project_id &&
                  'bg-accent'
              )}
            >
              <span className="truncate">{project.display_name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                v{project.api_version}
              </span>
            </button>
          ))
        )}
        <button
          type="button"
          onClick={() => onSelect({ type: 'new' })}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent rounded-sm transition-colors',
            value.type === 'new' && 'bg-accent'
          )}
        >
          <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
          New project
        </button>
      </div>
    </>
  );
}

export function ProjectSelector({
  value,
  onChange,
  teamId,
  githubHandle,
  userId,
  className,
}: ProjectSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const projects = useDashboardCacheStore((s) => s.projects);
  const isBootstrapping = useDashboardCacheStore((s) => s.isBootstrapping);

  useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const handleSelect = (v: ProjectSelectorValue) => {
    onChange(v);
    setOpen(false);
  };

  const teamLabel = getTeamLabel(teamId, userId, githubHandle);

  // When project is selected: two-part widget [Team] / [Project]
  if (value.type === 'project') {
    return (
      <div
        className={cn(
          'flex items-center gap-1 rounded-md border bg-background px-3 py-2 min-h-9',
          className
        )}
      >
        {/* Team part - click to navigate up */}
        <button
          type="button"
          onClick={() => handleSelect({ type: 'team' })}
          className="flex items-center gap-2 py-1 px-2 -ml-2 rounded-md hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          title="Back to team"
        >
          <div className="w-6 h-6 rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 flex items-center justify-center shrink-0">
            <FolderCog className="h-3 w-3 text-white" />
          </div>
          <span className="text-sm font-medium truncate max-w-[280px]">{teamLabel}</span>
          <ChevronUp className="h-4 w-4 shrink-0 opacity-50" />
        </button>

        <span className="text-muted-foreground/60 px-1 select-none">/</span>

        {/* Project part - click to switch projects */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 py-1 px-2 -mr-2 rounded-md hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 min-w-0"
              title="Switch project"
            >
              <div className="w-6 h-6 rounded-md bg-gradient-to-b from-purple-400 to-purple-700 flex items-center justify-center shrink-0">
                <Zap className="h-3 w-3 text-white" />
              </div>
              <span className="text-sm font-medium truncate max-w-[320px]">{value.project.display_name} <span className="text-muted-foreground font-normal">v{value.project.api_version}</span></span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-0" align="start">
            <ProjectDropdownContent
              value={value}
              onSelect={handleSelect}
              projects={projects}
              isBootstrapping={isBootstrapping}
              search={search}
              onSearchChange={setSearch}
              inputRef={inputRef}
              teamId={teamId}
              userId={userId}
              githubHandle={githubHandle}
            />
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  // Team or New project: single dropdown
  const displayLabel = value.type === 'team' ? teamLabel : value.type === 'new' ? 'New project' : 'Select project';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'min-w-[200px] justify-between font-normal',
            className
          )}
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <ProjectDropdownContent
          value={value}
          onSelect={handleSelect}
          projects={projects}
          isBootstrapping={isBootstrapping}
          search={search}
          onSearchChange={setSearch}
          inputRef={inputRef}
          teamId={teamId}
          userId={userId}
          githubHandle={githubHandle}
        />
      </PopoverContent>
    </Popover>
  );
}
