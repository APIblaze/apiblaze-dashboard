'use client';

import { useEffect, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ProjectConfig } from './types';
import { api } from '@/lib/api';
import { useDashboardCacheStore } from '@/store/dashboard-cache';
import type { AuthConfig } from '@/types/auth-config';
import type { Project } from '@/types/project';

interface ApiKeySectionProps {
  config: ProjectConfig;
  updateConfig: (updates: Partial<ProjectConfig>) => void;
  isEditMode?: boolean;
  project?: Project | null;
}

export function ApiKeySection({ config, updateConfig, isEditMode, project }: ApiKeySectionProps) {
  const existingAuthConfigs = useDashboardCacheStore((s) => s.getAuthConfigs());
  const previousEnableApiKeyRef = useRef<boolean | undefined>(config.enableApiKey);

  // Update authConfig's enable_api_key_auth when enableApiKey changes (edit mode)
  useEffect(() => {
    if (!isEditMode || !config.authConfigId || !project) {
      previousEnableApiKeyRef.current = config.enableApiKey;
      return;
    }
    if (previousEnableApiKeyRef.current === config.enableApiKey) return;

    const updateAuthConfigApiKey = async () => {
      try {
        let name = config.userGroupName;
        const authConfig = existingAuthConfigs.find((ac: AuthConfig) => ac.id === config.authConfigId);
        if (authConfig) {
          name = authConfig.name;
        } else if (!name) {
          const fullAuthConfig = await api.getAuthConfig(config.authConfigId!);
          name = fullAuthConfig.name;
        }
        await api.updateAuthConfig(config.authConfigId!, {
          name: name || 'Unnamed Auth Config',
          enableApiKeyAuth: config.enableApiKey,
        });
        previousEnableApiKeyRef.current = config.enableApiKey;
      } catch (error) {
        console.error('[ApiKeySection] Error updating authConfig enable_api_key_auth:', error);
      }
    };

    updateAuthConfigApiKey();
  }, [config.enableApiKey, config.authConfigId, config.userGroupName, isEditMode, project, existingAuthConfigs]);

  return (
    <div className="space-y-6">
      <div>
        <Label className="text-base font-semibold">API Key Authentication</Label>
        <p className="text-sm text-muted-foreground mb-4">
          Configure API key authentication for your API
        </p>
      </div>

      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div className="space-y-1">
          <Label htmlFor="enableApiKey" className="text-sm font-medium">
            Enable API Key Authentication
          </Label>
          <p className="text-xs text-muted-foreground">
            Users will authenticate using API keys. Portal helps users create them.
          </p>
        </div>
        <Switch
          id="enableApiKey"
          checked={config.enableApiKey}
          onCheckedChange={(checked) => updateConfig({ enableApiKey: checked })}
        />
      </div>
    </div>
  );
}
