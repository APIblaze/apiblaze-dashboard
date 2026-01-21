'use client';

import { useState, useEffect, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ProjectConfig } from './types';

interface ThrottlingSectionProps {
  config: ProjectConfig;
  updateConfig: (updates: Partial<ProjectConfig>) => void;
}

// Default throttling configuration (Free Tier defaults)
const DEFAULT_THROTTLING = {
  userRateLimit: 10,
  proxyDailyQuota: 1000,
  accountMonthlyQuota: 30000, // Free Tier default
} as const;

export function ThrottlingSection({ config, updateConfig }: ThrottlingSectionProps) {
  // Normalize throttling config with defaults (merges partial configs properly)
  const throttling = {
    ...DEFAULT_THROTTLING,
    ...config.throttling,
  };

  // Local state for input values (as strings to allow empty state)
  const [userRateLimitInput, setUserRateLimitInput] = useState<string>(throttling.userRateLimit.toString());
  const [proxyDailyQuotaInput, setProxyDailyQuotaInput] = useState<string>(throttling.proxyDailyQuota.toString());
  
  // Refs to preserve cursor position
  const userRateLimitRef = useRef<HTMLInputElement>(null);
  const proxyDailyQuotaRef = useRef<HTMLInputElement>(null);

  // Sync local state when config changes externally
  useEffect(() => {
    setUserRateLimitInput(throttling.userRateLimit.toString());
    setProxyDailyQuotaInput(throttling.proxyDailyQuota.toString());
  }, [throttling.userRateLimit, throttling.proxyDailyQuota]);

  // Helper to update throttling config with defaults
  const updateThrottling = (updates: Partial<ProjectConfig['throttling']>) => {
    // Normalize current throttling with defaults before merging updates
    const currentThrottling = {
      ...DEFAULT_THROTTLING,
      ...config.throttling,
    };
    
    updateConfig({
      throttling: {
        ...currentThrottling,
        ...updates,
      },
    });
  };
  
  // Calculate how long it would take to exhaust daily quota at current rate
  const secondsToExhaust =
    throttling.userRateLimit > 0
      ? throttling.proxyDailyQuota / throttling.userRateLimit
      : Infinity;

  const showWarning = secondsToExhaust <= 60; // Show warning if quota can be exhausted in 1 minute or less

  // Handle userRateLimit input change
  const handleUserRateLimitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const cursorPosition = input.selectionStart || 0;
    const value = e.target.value;
    setUserRateLimitInput(value);
    
    // Only update if value is a valid number
    if (value === '') {
      return; // Allow empty state while typing
    }
    
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue > 0) {
      const clampedValue = Math.min(numValue, throttling.proxyDailyQuota);
      updateThrottling({ userRateLimit: clampedValue });
      // Update input if value was clamped, preserving cursor position
      if (clampedValue !== numValue) {
        setUserRateLimitInput(clampedValue.toString());
        // Restore cursor position after state update
        setTimeout(() => {
          if (userRateLimitRef.current) {
            const newPosition = Math.min(cursorPosition, clampedValue.toString().length);
            userRateLimitRef.current.setSelectionRange(newPosition, newPosition);
          }
        }, 0);
      }
    }
  };

  // Handle userRateLimit blur - apply default if empty
  const handleUserRateLimitBlur = () => {
    if (userRateLimitInput === '' || isNaN(parseInt(userRateLimitInput, 10))) {
      const defaultValue = DEFAULT_THROTTLING.userRateLimit;
      setUserRateLimitInput(defaultValue.toString());
      updateThrottling({ userRateLimit: defaultValue });
    } else {
      const numValue = parseInt(userRateLimitInput, 10);
      const clampedValue = Math.min(Math.max(1, numValue), throttling.proxyDailyQuota);
      if (clampedValue !== numValue) {
        setUserRateLimitInput(clampedValue.toString());
        updateThrottling({ userRateLimit: clampedValue });
      }
    }
  };

  // Handle proxyDailyQuota input change
  const handleProxyDailyQuotaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const cursorPosition = input.selectionStart || 0;
    const value = e.target.value;
    setProxyDailyQuotaInput(value);
    
    // Only update if value is a valid number
    if (value === '') {
      return; // Allow empty state while typing
    }
    
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue > 0) {
      // If value exceeds max, reset to default daily quota
      if (numValue > throttling.accountMonthlyQuota) {
        const defaultDailyQuota = DEFAULT_THROTTLING.proxyDailyQuota;
        // If current userRateLimit exceeds default daily quota, clamp it
        const newUserRateLimit = Math.min(throttling.userRateLimit, defaultDailyQuota);
        updateThrottling({ 
          proxyDailyQuota: defaultDailyQuota,
          userRateLimit: newUserRateLimit
        });
        setProxyDailyQuotaInput(defaultDailyQuota.toString());
        // Update userRateLimit input if it was clamped
        if (newUserRateLimit !== throttling.userRateLimit) {
          setUserRateLimitInput(newUserRateLimit.toString());
        }
        // Restore cursor position after state update
        setTimeout(() => {
          if (proxyDailyQuotaRef.current) {
            const newPosition = defaultDailyQuota.toString().length;
            proxyDailyQuotaRef.current.setSelectionRange(newPosition, newPosition);
          }
        }, 0);
      } else {
        // Value is within limits, proceed normally
        const newDailyQuota = numValue;
        // If current userRateLimit exceeds new daily quota, clamp it
        const newUserRateLimit = Math.min(throttling.userRateLimit, newDailyQuota);
        updateThrottling({ 
          proxyDailyQuota: newDailyQuota,
          userRateLimit: newUserRateLimit
        });
        // Update userRateLimit input if it was clamped
        if (newUserRateLimit !== throttling.userRateLimit) {
          setUserRateLimitInput(newUserRateLimit.toString());
        }
      }
    }
  };

  // Handle proxyDailyQuota blur - apply default if empty
  const handleProxyDailyQuotaBlur = () => {
    if (proxyDailyQuotaInput === '' || isNaN(parseInt(proxyDailyQuotaInput, 10))) {
      const defaultValue = DEFAULT_THROTTLING.proxyDailyQuota;
      setProxyDailyQuotaInput(defaultValue.toString());
      updateThrottling({ proxyDailyQuota: defaultValue });
    } else {
      const numValue = parseInt(proxyDailyQuotaInput, 10);
      const clampedValue = Math.min(Math.max(1, numValue), throttling.accountMonthlyQuota);
      if (clampedValue !== numValue) {
        setProxyDailyQuotaInput(clampedValue.toString());
        updateThrottling({ proxyDailyQuota: clampedValue });
      }
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Label className="text-base font-semibold">Throttling & Rate Limiting</Label>
        <p className="text-sm text-muted-foreground mb-4">
          Configure rate limiting and usage quotas for your API. Limits are enforced at the per-user and per-proxy levels.
        </p>
      </div>

      <div className="space-y-8">
        {/* Per-User Rate Limiting */}
        <div className="space-y-4 p-4 border rounded-lg">
          <div>
            <Label className="text-sm font-semibold">Per-User Rate Limiting</Label>
            <p className="text-xs text-muted-foreground mb-3">
              Control the rate of requests per authenticated user. This limit applies to each individual user or API key.
            </p>
          </div>

          <div>
            <Label htmlFor="userRateLimit" className="text-sm">
              Requests per Second (per user)
            </Label>
            <Input
              ref={userRateLimitRef}
              id="userRateLimit"
              type="number"
              min="1"
              max={throttling.proxyDailyQuota}
              value={userRateLimitInput}
              onChange={handleUserRateLimitChange}
              onBlur={handleUserRateLimitBlur}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Maximum number of requests allowed per second for each user or API key (max: {throttling.proxyDailyQuota} req/sec, based on daily quota)
            </p>
            {showWarning && (
              <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs">
                <p className="text-yellow-800 dark:text-yellow-200 font-medium">
                  ⚠️ Warning: High Rate Limit
                </p>
                <p className="text-yellow-700 dark:text-yellow-300 mt-1">
                  At {throttling.userRateLimit} req/sec, the daily quota of {throttling.proxyDailyQuota.toLocaleString()} requests can be exhausted in {secondsToExhaust < 1 
                    ? 'less than 1 second' 
                    : secondsToExhaust < 2 
                    ? '~1 second' 
                    : `~${Math.round(secondsToExhaust)} seconds`}.
                </p>
              </div>
            )}
          </div>

          {/* COMMENTED OUT - Not using bucket model */}
          {/* <div>
            <Label htmlFor="userBurst" className="text-sm">
              Burst Allowance
            </Label>
            <Input
              id="userBurst"
              type="number"
              min="1"
              value={config.throttling?.userBurst ?? 20}
              onChange={(e) => {
                const value = parseInt(e.target.value) || 20;
                updateThrottling({ userBurst: value });
              }}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Maximum burst of requests allowed before throttling kicks in
            </p>
          </div> */}
        </div>

        {/* Per-Proxy Daily Quota */}
        <div className="space-y-4 p-4 border rounded-lg">
          <div>
            <Label className="text-sm font-semibold">Per-Proxy Daily Quota</Label>
            <p className="text-xs text-muted-foreground mb-3">
              Set a daily limit on total requests for this proxy/project. This quota resets every 24 hours.
            </p>
          </div>

          <div>
            <Label htmlFor="proxyDailyQuota" className="text-sm">
              Daily Quota Limit
            </Label>
            <Input
              ref={proxyDailyQuotaRef}
              id="proxyDailyQuota"
              type="number"
              min="1"
              max={throttling.accountMonthlyQuota}
              value={proxyDailyQuotaInput}
              onChange={handleProxyDailyQuotaChange}
              onBlur={handleProxyDailyQuotaBlur}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Maximum number of requests allowed per day for this proxy (resets daily)
              {/* Max should be set to account-level monthly quota / 30 days */}
            </p>
          </div>

          {/* Quota Period Selector - COMMENTED OUT (only using per day) */}
          {/* <div>
            <Label htmlFor="quotaInterval" className="text-sm">
              Quota Period
            </Label>
            <Select
              value="day"
              disabled
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Per Day</SelectItem>
                <SelectItem value="week">Per Week</SelectItem>
                <SelectItem value="month">Per Month</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Time period for quota calculation
            </p>
          </div> */}
        </div>
      </div>
    </div>
  );
}