'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ProjectConfig } from './types';

interface PortalSectionProps {
  config: ProjectConfig;
  updateConfig: (updates: Partial<ProjectConfig>) => void;
}

export function PortalSection({ config, updateConfig }: PortalSectionProps) {
  return (
    <div className="space-y-6">
      <div>
        <Label className="text-base font-semibold">Branding</Label>
        <p className="text-sm text-muted-foreground mb-4">
          Customize the appearance of your developer portal
        </p>
      </div>

      {/* Portal Logo */}
      <div className="space-y-4 pl-4 border-l-2 border-blue-200">
          <div>
            <Label htmlFor="portalLogoUrl" className="text-sm">
              Portal Logo URL
            </Label>
            <Input
              id="portalLogoUrl"
              placeholder="https://example.com/logo.png"
              value={config.portalLogoUrl}
              onChange={(e) => updateConfig({ portalLogoUrl: e.target.value })}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              URL to your logo image that will be displayed in the developer portal
            </p>
          </div>

          {config.projectName && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">
                Your portal will be available at:
              </p>
              <p className="text-sm font-mono text-blue-600 mt-1">
                https://{config.projectName}.portal.apiblaze.com
              </p>
            </div>
          )}
        </div>
    </div>
  );
}

