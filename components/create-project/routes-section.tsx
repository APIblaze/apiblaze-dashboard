'use client';

import { Label } from '@/components/ui/label';
import { ProjectConfig } from './types';

interface RoutesSectionProps {
  config: ProjectConfig;
  updateConfig: (updates: Partial<ProjectConfig>) => void;
}

export function RoutesSection({ config, updateConfig }: RoutesSectionProps) {
  return (
    <div className="space-y-6">
      <div>
        <Label className="text-base font-semibold">Routes</Label>
        <p className="text-sm text-muted-foreground mb-4">
          Configure route-level settings for your API
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        Route configuration coming soon.
      </p>
    </div>
  );
}
