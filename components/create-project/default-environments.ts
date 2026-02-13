/**
 * Default APIBlaze environments when none are specified.
 * MUST match v2APIblaze/config/default-environments.ts - update both when changing.
 */

import type { TargetServer, TargetServerConfig } from './types';

export const DEFAULT_ENVIRONMENT_NAMES = ['dev', 'test', 'prod'] as const;

export const DEFAULT_ENVIRONMENT_DESCRIPTIONS: Record<string, string> = {
  dev: 'Development',
  test: 'Test',
  prod: 'Production',
};

/**
 * Returns default target servers (dev, test, prod) for the Targets tab.
 * Use when no specific env/targets are provided.
 */
export function getDefaultTargetServers(targetUrl = ''): TargetServer[] {
  return DEFAULT_ENVIRONMENT_NAMES.map((stage) => ({
    stage,
    targetUrl,
    config: [] as TargetServerConfig[],
  }));
}
