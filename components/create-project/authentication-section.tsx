'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertCircle, Plus, X, Key, Check, ChevronDown, ChevronRight,
  ExternalLink, Loader2, Trash2, Github, Zap, Shield, Copy,
  Pencil, Info, Users,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { updateProjectConfig } from '@/lib/api/projects';
import { useDashboardCacheStore } from '@/store/dashboard-cache';
import { getFirstExternalCallbackUrl, buildAppLoginAuthorizeUrl } from '@/lib/build-app-login-url';
import { addPkceToAuthorizeUrl } from '@/lib/add-pkce-to-url';
import type { AppClient, AppClientBranding, SocialProvider as AuthSocialProvider } from '@/types/auth-config';
import type { Project } from '@/types/project';
import { ProjectConfig, SocialProvider } from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

const CLIENT_SECRET_MIN_LENGTH = 6;

const PROVIDER_DOMAINS: Record<SocialProvider, string> = {
  google: 'https://accounts.google.com',
  microsoft: 'https://login.microsoftonline.com',
  github: 'https://github.com',
  facebook: 'https://www.facebook.com',
  auth0: 'https://YOUR_DOMAIN.auth0.com',
  other: '',
};

const DEFAULT_SCOPES: Record<SocialProvider, string[]> = {
  google: ['email', 'offline_access', 'openid', 'profile'],
  github: ['read:user', 'user:email'],
  microsoft: ['email', 'offline_access', 'openid', 'profile'],
  facebook: ['email', 'public_profile'],
  auth0: ['offline_access', 'openid', 'profile', 'email'],
  other: ['offline_access', 'openid', 'profile'],
};

const PROVIDER_LABELS: Record<SocialProvider, string> = {
  google: 'Google',
  github: 'GitHub',
  microsoft: 'Microsoft',
  facebook: 'Facebook',
  auth0: 'Auth0',
  other: 'Custom / Other',
};

type AppClientRaw = AppClient & { client_id?: string; authorized_callback_urls?: string[] };
type ProviderRaw = AuthSocialProvider & { client_id?: string };

// ─── Provider Icon ────────────────────────────────────────────────────────────

function ProviderIcon({ id, size = 'md' }: { id: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-7 w-7' : 'h-5 w-5';
  switch (id) {
    case 'apiblaze':
      return (
        <div className={`${s} relative flex items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 text-white p-1 shrink-0`}>
          <Zap className="h-[0.85em] w-[0.85em] fill-current" strokeWidth={2} />
          <span className="absolute -bottom-0.5 -right-0.5 flex h-[0.7em] w-[0.7em] items-center justify-center rounded-full bg-[#24292f] dark:bg-white">
            <Github className="h-[0.55em] w-[0.55em] text-white dark:text-[#24292f]" strokeWidth={2.5} />
          </span>
        </div>
      );
    case 'google':
      return (
        <svg className={`${s} shrink-0`} viewBox="0 0 24 24" fill="none">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
      );
    case 'github':
      return <Github className={`${s} shrink-0 text-[#24292f] dark:text-white`} />;
    case 'microsoft':
      return (
        <svg className={`${s} shrink-0`} viewBox="0 0 23 23" fill="none">
          <path d="M1 1h10v10H1z" fill="#f25022" /><path d="M1 12h10v10H1z" fill="#00a4ef" />
          <path d="M12 1h10v10H12z" fill="#7fba00" /><path d="M12 12h10v10H12z" fill="#ffb900" />
        </svg>
      );
    case 'facebook':
      return (
        <svg className={`${s} shrink-0`} viewBox="0 0 24 24" fill="#1877F2">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      );
    case 'auth0':
      return (
        <div className={`${s} shrink-0 flex items-center justify-center rounded bg-[#eb5424] text-white`}>
          <Key className="h-[0.7em] w-[0.7em]" strokeWidth={2.5} />
        </div>
      );
    default:
      return <Key className={`${s} shrink-0 text-muted-foreground`} />;
  }
}

// ─── Section 1: Request Authentication ───────────────────────────────────────

function RequestsAuthSection({
  config, updateConfig,
}: {
  config: ProjectConfig;
  updateConfig: (u: Partial<ProjectConfig>) => void;
}) {
  const [newIss, setNewIss] = useState('');
  const [newAud, setNewAud] = useState('');
  const mode = config.requestsAuthMode ?? 'authenticate';
  const methods = config.requestsAuthMethods ?? ['jwt'];

  const toggleMethod = (id: 'jwt' | 'opaque' | 'api_key', on: boolean) => {
    const next = on
      ? [...methods.filter(m => m !== id), id]
      : methods.filter(m => m !== id) as ('jwt' | 'opaque' | 'api_key')[];
    updateConfig({ requestsAuthMethods: next.length ? next : ['jwt'] });
  };

  return (
    <div className="rounded-xl border bg-card">
      {/* Mode toggle */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
        {([
          { value: 'authenticate', label: 'Authenticate requests', desc: 'Verify JWT, opaque tokens or API keys on every request' },
          { value: 'passthrough', label: 'Pass through all traffic', desc: 'No auth check — proxy everything as-is' },
        ] as const).map(opt => {
          const sel = mode === opt.value;
          return (
            <button
              key={opt.value} type="button"
              onClick={() => updateConfig({ requestsAuthMode: opt.value })}
              className={`flex flex-col gap-1 p-4 rounded-xl border-2 text-left transition-all ${sel ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/40'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{opt.label}</span>
                {sel && <Check className="h-4 w-4 text-primary shrink-0" />}
              </div>
              <span className="text-xs text-muted-foreground">{opt.desc}</span>
            </button>
          );
        })}
      </div>

      {/* Method options */}
      {mode === 'authenticate' && (
        <div className="border-t px-4 pb-4 pt-3 space-y-4">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Accepted token types</Label>
          {([
            { id: 'jwt' as const, label: 'JWT tokens', desc: 'JSON Web Tokens — RS256 or HS256' },
            { id: 'opaque' as const, label: 'Opaque tokens', desc: 'Reference tokens verified via your own introspection endpoint' },
            { id: 'api_key' as const, label: 'API keys', desc: 'Simple long-lived API key authentication provided by API Blaze on the API portal' },
          ]).map(method => {
            const on = methods.includes(method.id);
            return (
              <div key={method.id} className="space-y-3">
                <div className="flex items-center gap-3">
                  <Switch id={`m-${method.id}`} checked={on} onCheckedChange={v => toggleMethod(method.id, v)} />
                  <div>
                    <Label htmlFor={`m-${method.id}`} className="text-sm font-medium cursor-pointer">{method.label}</Label>
                    <p className="text-xs text-muted-foreground">{method.desc}</p>
                  </div>
                </div>

                {/* JWT: sub-toggles */}
                {method.id === 'jwt' && on && (() => {
                  const apiblazeOn = config.allowApiblazeJwt !== false && config.enableSocialAuth;
                  const otherJwtOn = (config.allowOtherJwt ?? false) || !config.enableSocialAuth;
                  return (
                    <div className="ml-11 space-y-2">
                      {/* APIBlaze JWT */}
                      <div className="flex items-center gap-3">
                        <Switch
                          id="jwt-apiblaze"
                          checked={apiblazeOn}
                          onCheckedChange={v => { if (!v && !otherJwtOn) return; updateConfig({ allowApiblazeJwt: v }); }}
                          disabled={!config.enableSocialAuth}
                        />
                        <div>
                          <div className="flex items-center gap-1">
                            <Label htmlFor="jwt-apiblaze" className="text-xs font-medium cursor-pointer">APIBlaze JWT tokens</Label>
                            {(() => {
                              const pairs = (config.allowedPairs ?? []).filter(p => p.iss?.startsWith('https://auth.apiblaze'));
                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs text-xs space-y-1.5">
                                    {pairs.length === 0 ? (
                                      <p>No APIBlaze iss/aud pairs configured yet.</p>
                                    ) : (
                                      <>
                                        <p className="font-semibold">APIBlaze iss/aud pairs:</p>
                                        {pairs.map((p, i) => (
                                          <div key={i} className="font-mono text-[11px] space-y-0.5">
                                            <p><span className="text-muted-foreground">iss:</span> {p.iss}</p>
                                            <p><span className="text-muted-foreground">aud:</span> {p.aud}</p>
                                          </div>
                                        ))}
                                      </>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })()}
                          </div>
                          <p className="text-xs text-muted-foreground">APIBlaze JWT tokens issued by the login pages below get verified</p>
                        </div>
                      </div>

                      {/* Other JWT */}
                      <div className="flex items-center gap-3">
                        <Switch
                          id="jwt-other"
                          checked={otherJwtOn}
                          onCheckedChange={v => { if (!v && !apiblazeOn) return; updateConfig({ allowOtherJwt: v }); }}
                          disabled={!config.enableSocialAuth}
                        />
                        <div>
                          <Label htmlFor="jwt-other" className="text-xs font-medium cursor-pointer">Other JWT tokens</Label>
                          <p className="text-xs text-muted-foreground">Trust external JWTs via custom issuer/audience pairs</p>
                        </div>
                      </div>

                      {/* iss+aud pairs — shown when Other JWT is on */}
                      {otherJwtOn && (
                        <div className="ml-11 space-y-2">
                          <div className="flex items-center gap-1">
                            <p className="text-xs text-muted-foreground">Trusted issuer/audience pairs that will be used to authenticate JWT tokens.</p>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs text-xs">
                                Both iss and aud must match. Use this to trust external JWTs (e.g. from another IdP).
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          {(config.allowedPairs ?? []).filter(p => !p.iss.startsWith('https://auth.apiblaze')).length > 0 && (
                            <div className="flex flex-col gap-1">
                              {(config.allowedPairs ?? []).filter(p => !p.iss.startsWith('https://auth.apiblaze')).map((p, idx) => (
                                <div key={idx} className="inline-flex items-center gap-2 bg-muted px-2 py-1 rounded text-xs flex-wrap">
                                  <span className="font-mono truncate max-w-[160px]" title={p.iss}>{p.iss}</span>
                                  <span className="text-muted-foreground">+</span>
                                  <span className="font-mono truncate max-w-[160px]" title={p.aud}>{p.aud}</span>
                                  <button type="button" onClick={() => updateConfig({ allowedPairs: (config.allowedPairs ?? []).filter((_, i) => i !== idx) })} className="hover:text-destructive ml-auto">
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <Input placeholder="iss (e.g. https://auth.apiblaze.com/…)" value={newIss} onChange={e => setNewIss(e.target.value)} className="text-xs h-8 flex-1 min-w-32" />
                            <Input placeholder="aud (e.g. https://…portal.apiblaze.com/…)" value={newAud} onChange={e => setNewAud(e.target.value)} className="text-xs h-8 flex-1 min-w-32" />
                            <Button type="button" size="sm" className="h-8" disabled={!newIss.trim() || !newAud.trim()} onClick={() => {
                              updateConfig({ allowedPairs: [...(config.allowedPairs ?? []), { iss: newIss.trim(), aud: newAud.trim() }] });
                              setNewIss(''); setNewAud('');
                            }}>Add</Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Opaque token: endpoint */}
                {method.id === 'opaque' && on && (
                  <div className="ml-11 space-y-2">
                    <div>
                      <Label className="text-xs">Introspection endpoint</Label>
                      <Input placeholder="https://your-api.com/verify-token" value={config.opaqueTokenEndpoint ?? ''} onChange={e => updateConfig({ opaqueTokenEndpoint: e.target.value })} className={`mt-1 text-xs h-8 ${/google\.com|facebook\.com|github\.com|microsoft\.com/.test(config.opaqueTokenEndpoint ?? '') ? 'border-destructive focus-visible:ring-destructive' : ''}`} />
                      {/google\.com|facebook\.com|github\.com|microsoft\.com/.test(config.opaqueTokenEndpoint ?? '')
                        ? <p className="text-xs text-destructive mt-0.5">Social providers require that you build your own introspection endpoint rather than using theirs for every request</p>
                        : <p className="text-xs text-muted-foreground mt-0.5">Must return at minimum <code className="bg-muted px-0.5 rounded">{'{"sub":"…","exp":…}'}</code></p>
                      }
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <div>
                        <Label className="text-xs">Method</Label>
                        <Select value={config.opaqueTokenMethod ?? 'GET'} onValueChange={v => updateConfig({ opaqueTokenMethod: v as 'GET' | 'POST' })}>
                          <SelectTrigger className="mt-1 h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="GET">GET</SelectItem><SelectItem value="POST">POST</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1 min-w-40">
                        <Label className="text-xs">Params template <span className="text-muted-foreground">(use {'{token}'})</span></Label>
                        <Input value={config.opaqueTokenParams ?? '?access_token={token}'} onChange={e => updateConfig({ opaqueTokenParams: e.target.value })} className="mt-1 text-xs h-8" />
                      </div>
                    </div>
                  </div>
                )}

                {/* API key: end-user-id */}
                {method.id === 'api_key' && on && (
                  <div className="ml-11 flex items-center gap-3">
                    <Switch id="req-end-user" checked={config.requireApiKeyXEndUserId ?? false} onCheckedChange={v => updateConfig({ requireApiKeyXEndUserId: v })} />
                    <div>
                      <Label htmlFor="req-end-user" className="text-xs font-medium cursor-pointer">Require X-End-User-Id header</Label>
                      <p className="text-xs text-muted-foreground">Reject API key requests missing an end-user identifier</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Section 2 (Create): Login page setup ────────────────────────────────────

const APIBLAZE_CALLBACK_URL = 'https://callback.apiblaze.com';

const PROVIDER_SETUP_GUIDES: Record<string, { steps: string[] }> = {
  google: {
    steps: [
      'Go to Google Cloud Console (console.cloud.google.com)',
      'Select your project or create a new one',
      'Go to APIs & Services → Library',
      'Search for and enable: Google+ API',
      'Go to APIs & Services → Credentials',
      'Click + CREATE CREDENTIALS → OAuth 2.0 Client IDs',
      'Choose Web application as application type',
      `Add the authorized redirect URI: ${APIBLAZE_CALLBACK_URL}`,
      'Copy the Client ID and Client Secret',
    ],
  },
  github: {
    steps: [
      'Go to GitHub Settings → Developer settings → OAuth Apps',
      'Click "New OAuth App"',
      'Fill in your app name and homepage URL',
      `Set the Authorization callback URL to: ${APIBLAZE_CALLBACK_URL}`,
      'Click "Register application"',
      'Copy the Client ID and generate a Client Secret',
    ],
  },
  microsoft: {
    steps: [
      'Go to Azure Portal → Azure Active Directory → App registrations',
      'Click "New registration"',
      'Enter a name and choose supported account types',
      `Add a Redirect URI (Web): ${APIBLAZE_CALLBACK_URL}`,
      'Click Register',
      'Copy the Application (client) ID',
      'Go to Certificates & secrets → New client secret',
      'Copy the secret value',
    ],
  },
  facebook: {
    steps: [
      'Go to developers.facebook.com → My Apps',
      'Click "Create App" and choose Consumer type',
      'Add the Facebook Login product',
      `Set the Valid OAuth Redirect URI to: ${APIBLAZE_CALLBACK_URL}`,
      'Go to Settings → Basic to copy your App ID and App Secret',
    ],
  },
  auth0: {
    steps: [
      'Log in to your Auth0 dashboard',
      'Go to Applications → Applications → Create Application',
      'Choose "Regular Web Applications"',
      `In Settings, add ${APIBLAZE_CALLBACK_URL} to Allowed Callback URLs`,
      'Copy the Domain, Client ID, and Client Secret',
    ],
  },
  other: {
    steps: [
      'Create an OAuth 2.0 application in your identity provider',
      `Add ${APIBLAZE_CALLBACK_URL} as an authorized redirect / callback URI`,
      'Copy the Client ID and Client Secret',
      'Set the provider domain to your identity provider\'s base URL',
    ],
  },
};

function ProviderSetupGuide({ provider }: { provider: SocialProvider }) {
  const guide = PROVIDER_SETUP_GUIDES[provider];
  if (!guide) return null;
  return (
    <div className="space-y-3">
      {/* Callback notice */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3">
        <div className="flex items-center gap-2 mb-1">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">Important</span>
        </div>
        <p className="text-xs text-amber-700 dark:text-amber-400">Don&apos;t forget to add this authorized callback URL to your OAuth provider:</p>
        <code className="block mt-1.5 text-xs bg-background border rounded px-2 py-1.5 font-mono select-all">{APIBLAZE_CALLBACK_URL}</code>
      </div>
      {/* Setup steps */}
      <div className="rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center gap-2 mb-2">
          <ProviderIcon id={provider} size="sm" />
          <span className="text-xs font-semibold">{PROVIDER_LABELS[provider]} Setup Guide</span>
        </div>
        <ol className="space-y-1">
          {guide.steps.map((step, i) => (
            <li key={i} className="text-xs text-muted-foreground flex gap-2">
              <span className="shrink-0 text-primary font-medium">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

const CREATE_PROVIDERS = [
  { id: 'apiblaze', label: 'APIBlaze (via GitHub)', own: false, p: 'github' as SocialProvider },
  { id: 'google', label: 'Google', own: true, p: 'google' as SocialProvider },
  { id: 'github', label: 'GitHub', own: true, p: 'github' as SocialProvider },
  { id: 'microsoft', label: 'Microsoft', own: true, p: 'microsoft' as SocialProvider },
  { id: 'facebook', label: 'Facebook', own: true, p: 'facebook' as SocialProvider },
  { id: 'auth0', label: 'Auth0', own: true, p: 'auth0' as SocialProvider },
  { id: 'other', label: 'Custom', own: true, p: 'other' as SocialProvider },
];

function CreateModeLoginSetup({ config, updateConfig }: { config: ProjectConfig; updateConfig: (u: Partial<ProjectConfig>) => void }) {
  const [showAdv, setShowAdv] = useState(false);
  const [newCallbackUrl, setNewCallbackUrl] = useState('');
  const [newScope, setNewScope] = useState('');
  const enabled = config.enableSocialAuth ?? false;
  const bringOwn = config.bringOwnProvider ?? false;
  const provider = config.socialProvider ?? 'google';
  const scopes = config.scopes ?? DEFAULT_SCOPES[provider];
  const callbackUrls = config.authorizedCallbackUrls ?? [];
  const defaultCallbackUrl = config.projectName
    ? `https://${config.projectName}-api.portal.apiblaze.com/${config.apiVersion || '1.0.0'}`
    : '';

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between p-4">
        <div>
          <Label className="text-sm font-semibold">Add a login page for your API users?</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Users authenticate via OAuth to get access tokens for your proxy and API portal.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={v => updateConfig({ enableSocialAuth: v })} />
      </div>

      {enabled && (
        <div className="border-t px-4 pb-4 pt-3 space-y-4">
          {/* Who can register */}
          <div>
            <Label className="text-xs font-medium">Who can register to login and use the API?</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {([
                { value: 'anyone', label: 'Anyone', desc: 'Any user can sign up and log in' },
                { value: 'authorized_only', label: 'Authorized only', desc: 'Only pre-approved users can log in' },
              ] as const).map(opt => {
                const sel = (config.whoCanRegisterToLogin ?? 'anyone') === opt.value;
                return (
                  <button key={opt.value} type="button"
                    onClick={() => updateConfig({ whoCanRegisterToLogin: opt.value })}
                    className={`flex flex-col gap-0.5 p-3 rounded-lg border-2 text-left transition-all ${sel ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/40'}`}
                  >
                    <span className="text-xs font-semibold flex items-center gap-1.5">{sel && <Check className="h-3 w-3 text-primary" />}{opt.label}</span>
                    <span className="text-xs text-muted-foreground">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Identity provider</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CREATE_PROVIDERS.map(opt => {
              const sel = opt.own ? (bringOwn && provider === opt.p) : !bringOwn;
              return (
                <button key={opt.id} type="button"
                  onClick={() => {
                    if (opt.own) {
                      updateConfig({ bringOwnProvider: true, socialProvider: opt.p, identityProviderDomain: PROVIDER_DOMAINS[opt.p], scopes: [...DEFAULT_SCOPES[opt.p]] });
                    } else {
                      updateConfig({ bringOwnProvider: false, socialProvider: 'github' });
                    }
                  }}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 text-center transition-all ${sel ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/40'}`}
                >
                  <ProviderIcon id={opt.id} size="lg" />
                  <span className="text-xs font-medium leading-tight">{opt.label}</span>
                  {sel && <Check className="h-3 w-3 text-primary" />}
                </button>
              );
            })}
          </div>

          {/* APIBlaze built-in info */}
          {!bringOwn && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <ProviderIcon id="apiblaze" size="sm" />
              <p className="text-xs text-muted-foreground">
                Using APIBlaze&apos;s built-in GitHub OAuth — zero setup required. Users log in with their GitHub account.
                You can add your own provider after deployment.
              </p>
            </div>
          )}

          {/* Bring your own credentials */}
          {bringOwn && (
            <div className="space-y-3 p-4 border rounded-lg bg-muted/20">
              <div className="flex items-center gap-2">
                <ProviderIcon id={provider} size="sm" />
                <Label className="text-sm font-semibold">{PROVIDER_LABELS[provider]} credentials</Label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Client ID</Label>
                  <Input placeholder="Your OAuth client ID" value={config.identityProviderClientId ?? ''} onChange={e => updateConfig({ identityProviderClientId: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Client Secret</Label>
                  <Input type="password" placeholder="Your OAuth client secret" value={config.identityProviderClientSecret ?? ''} onChange={e => updateConfig({ identityProviderClientSecret: e.target.value })} className="mt-1" />
                  {(config.identityProviderClientSecret ?? '').length > 0 && (config.identityProviderClientSecret ?? '').length < CLIENT_SECRET_MIN_LENGTH && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Must be at least {CLIENT_SECRET_MIN_LENGTH} characters.
                    </p>
                  )}
                </div>
              </div>

              <button type="button" onClick={() => setShowAdv(v => !v)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {showAdv ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Advanced settings
              </button>
              {showAdv && (
                <div className="pl-4 border-l-2 border-muted space-y-4">
                  <div>
                    <Label className="text-xs">Identity provider domain</Label>
                    <Input placeholder={PROVIDER_DOMAINS[provider] || 'https://your-domain.example.com'} value={config.identityProviderDomain ?? ''} onChange={e => updateConfig({ identityProviderDomain: e.target.value })} className="mt-1 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Client side token type</Label>
                    <p className="text-xs text-muted-foreground mb-1">Tokens the API users will see</p>
                    <Select value={config.tokenType ?? 'apiblaze'} onValueChange={v => {
                      const updates: Partial<typeof config> = { tokenType: v as 'apiblaze' | 'thirdParty' };
                      if (v === 'thirdParty') {
                        const currentMethods = config.requestsAuthMethods ?? ['jwt'];
                        if (!currentMethods.includes('jwt')) updates.requestsAuthMethods = [...currentMethods, 'jwt'];
                        updates.allowApiblazeJwt = true;
                        updates.allowOtherJwt = true;
                        updates.enableSocialAuth = true;
                      }
                      updateConfig(updates);
                    }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="apiblaze">API Blaze JWT token</SelectItem>
                        <SelectItem value="thirdParty">Third Party</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(config.tokenType ?? 'apiblaze') !== 'thirdParty' && (
                    <div>
                      <Label className="text-xs font-medium">Target server token type</Label>
                      <p className="text-xs text-muted-foreground mb-1">What to send in the Authorization header to your target servers</p>
                      <Select value={config.targetServerToken ?? 'apiblaze'} onValueChange={v => updateConfig({ targetServerToken: v as 'apiblaze' | 'third_party_access_token' | 'third_party_id_token' | 'none' })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="apiblaze">API Blaze JWT token</SelectItem>
                          <SelectItem value="third_party_access_token">{PROVIDER_LABELS[provider]} access token</SelectItem>
                          <SelectItem value="third_party_id_token">{PROVIDER_LABELS[provider]} ID token</SelectItem>
                          <SelectItem value="none">None</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs font-medium">Authorized Scopes</Label>
                    <p className="text-xs text-muted-foreground mb-1">Default scopes for {PROVIDER_LABELS[provider]}: {DEFAULT_SCOPES[provider].join(', ')}</p>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {scopes.map(s => (
                        <Badge key={s} variant="secondary" className="gap-1 text-xs">
                          {s}
                          <button type="button" onClick={() => updateConfig({ scopes: scopes.filter(x => x !== s) })}><X className="h-3 w-3" /></button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input placeholder="Add custom scope" value={newScope} onChange={e => setNewScope(e.target.value)} className="h-8 text-xs"
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newScope.trim() && !scopes.includes(newScope.trim())) { updateConfig({ scopes: [...scopes, newScope.trim()] }); setNewScope(''); } } }} />
                      <Button type="button" size="sm" className="h-8" onClick={() => { if (newScope.trim() && !scopes.includes(newScope.trim())) { updateConfig({ scopes: [...scopes, newScope.trim()] }); setNewScope(''); } }}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Authorized Callback URLs</Label>
                    <div className="flex flex-wrap gap-1 mt-1 mb-2">
                      {callbackUrls.length > 0
                        ? callbackUrls.map((url, i) => (
                            <Badge key={i} variant="secondary" className="gap-1 text-xs font-mono">
                              {url}
                              <button type="button" onClick={() => updateConfig({ authorizedCallbackUrls: callbackUrls.filter((_, j) => j !== i) })}><X className="h-3 w-3" /></button>
                            </Badge>
                          ))
                        : defaultCallbackUrl
                          ? <Badge variant="secondary" className="gap-1 text-xs font-mono"><span className="text-muted-foreground">Default:</span> {defaultCallbackUrl}</Badge>
                          : null}
                    </div>
                    <div className="flex gap-2">
                      <Input placeholder="https://example.com/callback" value={newCallbackUrl} onChange={e => setNewCallbackUrl(e.target.value)} className="h-8 text-xs"
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newCallbackUrl.trim() && !callbackUrls.includes(newCallbackUrl.trim())) { updateConfig({ authorizedCallbackUrls: [...callbackUrls, newCallbackUrl.trim()] }); setNewCallbackUrl(''); } } }} />
                      <Button type="button" size="sm" className="h-8" onClick={() => { if (newCallbackUrl.trim() && !callbackUrls.includes(newCallbackUrl.trim())) { updateConfig({ authorizedCallbackUrls: [...callbackUrls, newCallbackUrl.trim()] }); setNewCallbackUrl(''); } }}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Callback notice + setup guide */}
              <ProviderSetupGuide provider={provider} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Provider Dialog (Add / Edit) ─────────────────────────────────────────────

interface ProviderFormState {
  type: SocialProvider;
  clientId: string;
  clientSecret: string;
  domain: string;
  scopes: string[];
  newScope: string;
}

function ProviderDialog({
  open, onOpenChange, initial, isEdit, onSave, saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: ProviderFormState;
  isEdit: boolean;
  onSave: (f: ProviderFormState) => Promise<void>;
  saving: boolean;
}) {
  const [form, setForm] = useState<ProviderFormState>(initial);
  const [showAdv, setShowAdv] = useState(false);
  const upd = (u: Partial<ProviderFormState>) => setForm(f => ({ ...f, ...u }));

  useEffect(() => {
    if (open) { setForm(initial); setShowAdv(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const secretOk = form.clientSecret === '' || form.clientSecret.length >= CLIENT_SECRET_MIN_LENGTH;
  const canSave = form.clientId.trim() !== '' && secretOk && (!isEdit || form.clientSecret !== '' ? secretOk : true);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit provider' : 'Add OAuth provider'}</DialogTitle>
          <DialogDescription>Configure which OAuth identity provider users will log in with.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Provider type chips */}
          <div>
            <Label className="text-xs">Provider</Label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {(['google', 'github', 'microsoft', 'facebook', 'auth0', 'other'] as SocialProvider[]).map(p => (
                <button key={p} type="button"
                  onClick={() => upd({ type: p, domain: PROVIDER_DOMAINS[p], scopes: [...DEFAULT_SCOPES[p]] })}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 text-xs transition-all ${form.type === p ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/40'}`}
                >
                  <ProviderIcon id={p} size="sm" />
                  <span>{PROVIDER_LABELS[p].split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Client ID</Label>
            <Input placeholder="Your OAuth client ID" value={form.clientId} onChange={e => upd({ clientId: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Client Secret</Label>
            <Input type="password" placeholder={isEdit ? 'Leave blank to keep current secret' : 'Your OAuth client secret'} value={form.clientSecret} onChange={e => upd({ clientSecret: e.target.value })} className="mt-1" />
            {form.clientSecret.length > 0 && form.clientSecret.length < CLIENT_SECRET_MIN_LENGTH && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Must be at least {CLIENT_SECRET_MIN_LENGTH} characters.</p>
            )}
          </div>

          <button type="button" onClick={() => setShowAdv(v => !v)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {showAdv ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Advanced (domain, scopes)
          </button>
          {showAdv && (
            <div className="pl-4 border-l-2 border-muted space-y-3">
              <div>
                <Label className="text-xs">Provider domain</Label>
                <Input placeholder={PROVIDER_DOMAINS[form.type] || 'https://…'} value={form.domain} onChange={e => upd({ domain: e.target.value })} className="mt-1 text-xs" />
              </div>
              <div>
                <Label className="text-xs">Scopes</Label>
                <div className="flex flex-wrap gap-1 mt-1 mb-1">
                  {form.scopes.map(s => (
                    <Badge key={s} variant="secondary" className="gap-1 text-xs">
                      {s}
                      <button type="button" onClick={() => upd({ scopes: form.scopes.filter(x => x !== s) })}><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input placeholder="Add scope" value={form.newScope} onChange={e => upd({ newScope: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); if (form.newScope.trim() && !form.scopes.includes(form.newScope.trim())) { upd({ scopes: [...form.scopes, form.newScope.trim()], newScope: '' }); } }
                    }}
                    className="text-xs h-8" />
                  <Button type="button" size="sm" className="h-8" onClick={() => { if (form.newScope.trim() && !form.scopes.includes(form.newScope.trim())) { upd({ scopes: [...form.scopes, form.newScope.trim()], newScope: '' }); } }}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!canSave || saving} onClick={() => onSave(form)}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isEdit ? 'Save changes' : 'Add provider'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── New Tenant Setup Dialog ──────────────────────────────────────────────────

interface NewTenantForm {
  slug: string;
  display: string;
  enableLogin: boolean;
  whoCanRegister: 'anyone' | 'authorized_only';
  bringOwn: boolean;
  provider: SocialProvider;
  clientId: string;
  clientSecret: string;
  domain: string;
  tokenType: 'apiblaze' | 'thirdParty';
  targetServerToken: 'apiblaze' | 'third_party_access_token' | 'third_party_id_token' | 'none';
  scopes: string[];
  appClientName: string;
  callbackUrl: string;
}

const DEFAULT_TENANT_FORM: NewTenantForm = {
  slug: '', display: '', enableLogin: true,
  whoCanRegister: 'anyone',
  bringOwn: false, provider: 'github',
  clientId: '', clientSecret: '', domain: '',
  tokenType: 'apiblaze', targetServerToken: 'apiblaze',
  scopes: [...DEFAULT_SCOPES['github']],
  appClientName: '', callbackUrl: '',
};

function NewTenantSetupDialog({
  open, onOpenChange, teamId, project, onSuccess, onEnableJwt,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  teamId: string;
  project: Project;
  onSuccess: (slug: string) => void;
  onEnableJwt?: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<NewTenantForm>(DEFAULT_TENANT_FORM);
  const [showProviderAdv, setShowProviderAdv] = useState(false);
  const [showCallbackAdv, setShowCallbackAdv] = useState(false);
  const [newScopeInput, setNewScopeInput] = useState('');
  const [saving, setSaving] = useState(false);
  const upd = (u: Partial<NewTenantForm>) => setForm(f => ({ ...f, ...u }));

  useEffect(() => {
    if (open) { setForm(DEFAULT_TENANT_FORM); setShowProviderAdv(false); setShowCallbackAdv(false); }
  }, [open]);

  // Auto-fill slug from display name
  const handleDisplayChange = (v: string) => {
    const auto = v.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 32);
    upd({ display: v, slug: auto });
  };

  const defaultCallbackUrl = form.slug
    ? `https://${project.project_id}-${form.slug}.portal.apiblaze.com/${project.api_version}`
    : '';

  const secretOk = !form.bringOwn || form.clientSecret === '' || form.clientSecret.length >= CLIENT_SECRET_MIN_LENGTH;
  const canSubmit = form.slug.trim() !== '' && secretOk &&
    (!form.enableLogin || !form.bringOwn || (form.clientId.trim() !== '' && form.clientSecret.length >= CLIENT_SECRET_MIN_LENGTH));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await api.createTeamTenant(teamId, { tenant_name: form.slug, display_name: form.display.trim() || form.slug });
      await api.attachTenantToProject(project.project_id, project.api_version, { tenant_name: form.slug, display_name: form.display.trim() || form.slug });

      if (form.enableLogin) {
        const clientName = form.appClientName.trim() || `${form.display.trim() || form.slug}-client`;
        const callbackUrl = form.callbackUrl.trim() || defaultCallbackUrl;
        const client = await api.createAppClientForTenant(teamId, form.slug, {
          name: clientName,
          tenant: form.slug,
          scopes: form.scopes.length ? form.scopes : DEFAULT_SCOPES[form.provider],
          authorizedCallbackUrls: [callbackUrl],
          projectName: project.project_id,
          apiVersion: project.api_version || '1.0.0',
          whoCanRegister: form.whoCanRegister,
        });

        if (form.bringOwn && form.clientId.trim() && form.clientSecret.length >= CLIENT_SECRET_MIN_LENGTH) {
          const clientId = (client as { id?: string; clientId?: string }).id ?? (client as { id?: string; clientId?: string }).clientId ?? '';
          if (clientId) {
            await api.addProviderByTenant(teamId, form.slug, clientId, {
              type: form.provider,
              clientId: form.clientId.trim(),
              clientSecret: form.clientSecret,
              scopes: form.scopes.length ? form.scopes : [...DEFAULT_SCOPES[form.provider]],
              domain: form.domain.trim() || PROVIDER_DOMAINS[form.provider] || undefined,
              tokenType: form.tokenType,
              targetServerToken: form.targetServerToken,
            } as Parameters<typeof api.addProviderByTenant>[3]);
          }
        }
      }

      onSuccess(form.slug);
      onOpenChange(false);
      toast({ title: 'Tenant created', description: `${form.display.trim() || form.slug} is ready.` });
    } catch (e) {
      toast({ title: 'Failed to create tenant', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>New tenant</DialogTitle>
          <DialogDescription>A tenant isolates auth settings and login pages for a segment of your users.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1 overflow-y-auto flex-1 pr-1">
          {/* Tenant identity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tenant</Label>
              <Input placeholder="e.g. acme" value={form.slug} onChange={e => upd({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32) })} className="mt-1 font-mono" />
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                {project.project_id}-<span className="text-foreground">{form.slug || 'tenant'}</span>.apiblaze.com
              </p>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input placeholder="e.g. Acme Corp" value={form.display} onChange={e => handleDisplayChange(e.target.value)} className="mt-1" />
            </div>
          </div>

          <Separator />

          {/* Login page toggle */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label className="text-sm font-semibold">Add a login page?</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Users authenticate via OAuth to get access tokens for your proxy and portal.
              </p>
            </div>
            <Switch checked={form.enableLogin} onCheckedChange={v => upd({ enableLogin: v })} />
          </div>

          {form.enableLogin && (
            <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
              {/* Who can register */}
              <div>
                <Label className="text-xs font-medium">Who can register to login and use the API?</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {([
                    { value: 'anyone', label: 'Anyone', desc: 'Any user can sign up and log in' },
                    { value: 'authorized_only', label: 'Authorized only', desc: 'Only pre-approved users can log in' },
                  ] as const).map(opt => {
                    const sel = form.whoCanRegister === opt.value;
                    return (
                      <button key={opt.value} type="button"
                        onClick={() => upd({ whoCanRegister: opt.value })}
                        className={`flex flex-col gap-0.5 p-3 rounded-lg border-2 text-left transition-all ${sel ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/40'}`}
                      >
                        <span className="text-xs font-semibold flex items-center gap-1.5">{sel && <Check className="h-3 w-3 text-primary" />}{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* App client name */}
              <div>
                <Label className="text-xs">App client name <span className="text-muted-foreground">(optional)</span></Label>
                <Input placeholder={`${form.display.trim() || form.slug || 'my'}-client`} value={form.appClientName} onChange={e => upd({ appClientName: e.target.value })} className="mt-1" />
              </div>

              {/* Provider selection */}
              <div>
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Identity provider</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                  {CREATE_PROVIDERS.map(opt => {
                    const sel = opt.own ? (form.bringOwn && form.provider === opt.p) : !form.bringOwn;
                    return (
                      <button key={opt.id} type="button"
                        onClick={() => {
                          if (opt.own) {
                            upd({ bringOwn: true, provider: opt.p, domain: PROVIDER_DOMAINS[opt.p], scopes: [...DEFAULT_SCOPES[opt.p]] });
                          } else {
                            upd({ bringOwn: false, provider: 'github', scopes: [...DEFAULT_SCOPES['github']] });
                          }
                        }}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 text-center transition-all ${sel ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/40'}`}
                      >
                        <ProviderIcon id={opt.id} size="lg" />
                        <span className="text-xs font-medium leading-tight">{opt.label}</span>
                        {sel && <Check className="h-3 w-3 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {!form.bringOwn && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                  <ProviderIcon id="apiblaze" size="sm" />
                  <p className="text-xs text-muted-foreground">
                    Using APIBlaze&apos;s built-in GitHub OAuth — zero setup required. Users log in with their GitHub account.
                  </p>
                </div>
              )}

              {form.bringOwn && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <ProviderIcon id={form.provider} size="sm" />
                    <Label className="text-sm font-semibold">{PROVIDER_LABELS[form.provider]} credentials</Label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Client ID</Label>
                      <Input placeholder="Your OAuth client ID" value={form.clientId} onChange={e => upd({ clientId: e.target.value })} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">Client Secret</Label>
                      <Input type="password" placeholder="Your OAuth client secret" value={form.clientSecret} onChange={e => upd({ clientSecret: e.target.value })} className="mt-1" />
                      {form.clientSecret.length > 0 && form.clientSecret.length < CLIENT_SECRET_MIN_LENGTH && (
                        <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> Must be at least {CLIENT_SECRET_MIN_LENGTH} characters.
                        </p>
                      )}
                    </div>
                  </div>

                  <button type="button" onClick={() => setShowProviderAdv(v => !v)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {showProviderAdv ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    Advanced settings
                  </button>
                  {showProviderAdv && (
                    <div className="pl-4 border-l-2 border-muted space-y-4">
                      <div>
                        <Label className="text-xs">Identity provider domain</Label>
                        <Input placeholder={PROVIDER_DOMAINS[form.provider] || 'https://your-domain.example.com'} value={form.domain} onChange={e => upd({ domain: e.target.value })} className="mt-1 text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs font-medium">Client side token type</Label>
                        <p className="text-xs text-muted-foreground mb-1">Tokens the API users will see</p>
                        <Select value={form.tokenType} onValueChange={v => {
                          upd({ tokenType: v as 'apiblaze' | 'thirdParty' });
                          if (v === 'thirdParty') onEnableJwt?.();
                        }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="apiblaze">API Blaze JWT token</SelectItem>
                            <SelectItem value="thirdParty">Third Party</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {form.tokenType !== 'thirdParty' && (
                        <div>
                          <Label className="text-xs font-medium">Target server token type</Label>
                          <p className="text-xs text-muted-foreground mb-1">What to send in the Authorization header to your target servers</p>
                          <Select value={form.targetServerToken} onValueChange={v => upd({ targetServerToken: v as 'apiblaze' | 'third_party_access_token' | 'third_party_id_token' | 'none' })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="apiblaze">API Blaze JWT token</SelectItem>
                              <SelectItem value="third_party_access_token">{PROVIDER_LABELS[form.provider]} access token</SelectItem>
                              <SelectItem value="third_party_id_token">{PROVIDER_LABELS[form.provider]} ID token</SelectItem>
                              <SelectItem value="none">None</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div>
                        <Label className="text-xs font-medium">Authorized Scopes</Label>
                        <p className="text-xs text-muted-foreground mb-1">Default scopes for {PROVIDER_LABELS[form.provider]}: {DEFAULT_SCOPES[form.provider].join(', ')}</p>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {form.scopes.map(s => (
                            <Badge key={s} variant="secondary" className="gap-1 text-xs">
                              {s}
                              <button type="button" onClick={() => upd({ scopes: form.scopes.filter(x => x !== s) })}><X className="h-3 w-3" /></button>
                            </Badge>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Input placeholder="Add custom scope" value={newScopeInput} onChange={e => setNewScopeInput(e.target.value)} className="h-8 text-xs"
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newScopeInput.trim() && !form.scopes.includes(newScopeInput.trim())) { upd({ scopes: [...form.scopes, newScopeInput.trim()] }); setNewScopeInput(''); } } }} />
                          <Button type="button" size="sm" className="h-8" onClick={() => { if (newScopeInput.trim() && !form.scopes.includes(newScopeInput.trim())) { upd({ scopes: [...form.scopes, newScopeInput.trim()] }); setNewScopeInput(''); } }}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Setup guide + callback notice */}
                  <ProviderSetupGuide provider={form.provider} />
                </div>
              )}

              {/* App client callback URL */}
              <button type="button" onClick={() => setShowCallbackAdv(v => !v)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {showCallbackAdv ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Custom app client callback URL
              </button>
              {showCallbackAdv && (
                <div className="pl-4 border-l-2 border-muted space-y-2">
                  {defaultCallbackUrl && !form.callbackUrl && (
                    <div className="flex items-center gap-2 text-xs bg-background border rounded px-2 py-1">
                      <span className="text-muted-foreground shrink-0">Default</span>
                      <span className="flex-1 font-mono truncate">{defaultCallbackUrl}</span>
                    </div>
                  )}
                  <Label className="text-xs">Override callback URL <span className="text-muted-foreground">(optional)</span></Label>
                  <Input placeholder={defaultCallbackUrl} value={form.callbackUrl} onChange={e => upd({ callbackUrl: e.target.value })} className="mt-1 text-xs" />
                  <p className="text-xs text-muted-foreground">Leave empty to use the APIBlaze portal default.</p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button disabled={!canSubmit || saving} onClick={handleSubmit}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Create tenant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── App Client Panel ─────────────────────────────────────────────────────────

function AppClientPanel({
  client, tenantTeamId, tenant, teamId, config, project, onRefresh, isDefault, onSetDefault, defaultExpanded,
}: {
  client: AppClientRaw;
  tenantTeamId: string;
  tenant: string;
  teamId?: string;
  config: ProjectConfig;
  project?: Project | null;
  onRefresh: () => void;
  isDefault: boolean;
  onSetDefault: () => void;
  defaultExpanded?: boolean;
}) {
  const { toast } = useToast();
  const getProvidersForTenant = useDashboardCacheStore(s => s.getProvidersForTenant);
  const fetchProvidersForTenant = useDashboardCacheStore(s => s.fetchProvidersForTenant);
  const invalidateAndRefetch = useDashboardCacheStore(s => s.invalidateAndRefetch);
  const providersByConfigClient = useDashboardCacheStore(s => s.providersByConfigClient);

  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [editProviderInitial, setEditProviderInitial] = useState<ProviderFormState | null>(null);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [loadingProviderId, setLoadingProviderId] = useState<string | null>(null);
  const [providerSaving, setProviderSaving] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editCallbackUrls, setEditCallbackUrls] = useState<string[]>([]);
  const [editNewCallbackUrl, setEditNewCallbackUrl] = useState('');
  const [editBranding, setEditBranding] = useState<AppClientBranding>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const providers = useMemo(
    () => getProvidersForTenant(tenantTeamId, tenant, client.id) as ProviderRaw[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tenantTeamId, tenant, client.id, getProvidersForTenant, providersByConfigClient]
  );

  useEffect(() => {
    fetchProvidersForTenant(tenantTeamId, tenant, client.id);
  }, [tenantTeamId, tenant, client.id, fetchProvidersForTenant]);

  useEffect(() => {
    const urls = (client.authorizedCallbackUrls ?? client.authorized_callback_urls ?? []) as string[];
    const external = getFirstExternalCallbackUrl(urls);
    if (!external) return;
    const oauthId = client.clientId ?? client.client_id ?? client.id;
    const scopes = (client.scopes ?? []) as string[];
    addPkceToAuthorizeUrl(buildAppLoginAuthorizeUrl(oauthId, external, scopes, undefined)).then(url => setLoginUrl(url));
  }, [client]);

  // Pre-load form data when mounted expanded
  useEffect(() => {
    if (defaultExpanded) {
      setEditName(client.name ?? '');
      setEditCallbackUrls((client.authorizedCallbackUrls ?? client.authorized_callback_urls ?? []) as string[]);
      setEditBranding({ ...(client.branding ?? {}) });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEditProvider = async (p: ProviderRaw) => {
    setLoadingProviderId(p.id);
    let secret = '';
    try {
      const res = await api.getProviderSecretByTenant(tenantTeamId, tenant, client.id, p.id);
      secret = res.clientSecret ?? '';
    } catch { /* show empty, user can type new one */ }
    const rawScopes = p.scopes ?? [];
    const scopes = Array.isArray(rawScopes) ? rawScopes as string[] : DEFAULT_SCOPES[p.type as SocialProvider];
    setEditProviderInitial({
      type: p.type as SocialProvider,
      clientId: p.clientId ?? p.client_id ?? '',
      clientSecret: secret,
      domain: p.domain ?? PROVIDER_DOMAINS[p.type as SocialProvider] ?? '',
      scopes,
      newScope: '',
    });
    setEditingProviderId(p.id);
    setLoadingProviderId(null);
    setProviderDialogOpen(true);
  };

  const handleDeleteProvider = async (p: ProviderRaw) => {
    if (!confirm(`Remove ${PROVIDER_LABELS[p.type as SocialProvider] ?? p.type} provider?`)) return;
    try {
      await api.removeProviderByTenant(tenantTeamId, tenant, client.id, p.id);
      await invalidateAndRefetch(teamId);
      toast({ title: 'Provider removed' });
    } catch (e) {
      toast({ title: 'Failed to remove provider', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  const handleSaveProvider = async (form: ProviderFormState) => {
    setProviderSaving(true);
    try {
      const payload = {
        type: form.type,
        clientId: form.clientId.trim(),
        clientSecret: form.clientSecret.trim(),
        scopes: form.scopes.length ? form.scopes : DEFAULT_SCOPES[form.type],
        domain: form.domain || PROVIDER_DOMAINS[form.type],
        tokenType: 'apiblaze' as const,
        targetServerToken: 'apiblaze' as const,
        includeApiblazeAccessTokenHeader: false,
        includeApiblazeIdTokenHeader: false,
      };
      if (editingProviderId) {
        await api.updateProviderByTenant(tenantTeamId, tenant, client.id, editingProviderId, payload);
        toast({ title: 'Provider updated' });
      } else {
        await api.addProviderByTenant(tenantTeamId, tenant, client.id, payload);
        toast({ title: 'Provider added' });
      }
      await invalidateAndRefetch(teamId);
      setProviderDialogOpen(false);
      setEditingProviderId(null);
      setEditProviderInitial(null);
    } catch (e) {
      toast({ title: 'Failed to save provider', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setProviderSaving(false);
    }
  };

  const handleOpenEdit = () => {
    setEditName(client.name ?? '');
    setEditCallbackUrls((client.authorizedCallbackUrls ?? (client as AppClientRaw).authorized_callback_urls ?? []) as string[]);
    setEditNewCallbackUrl('');
    setEditBranding({ ...(client.branding ?? {}) });
    setExpanded(true);
  };

  const handleSaveEdit = async () => {
    setSavingEdit(true);
    try {
      await api.updateAppClientByTenant(tenantTeamId, tenant, client.id, {
        name: editName.trim() || client.name,
        authorizedCallbackUrls: editCallbackUrls.filter(u => u.trim()),
        branding: editBranding,
      });
      await invalidateAndRefetch(teamId);
      onRefresh();
      setExpanded(false);
      toast({ title: 'App client updated' });
    } catch (e) {
      toast({ title: 'Failed to update app client', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteClient = async () => {
    if (!confirm('Delete this app client? This cannot be undone.')) return;
    setDeleteLoading(true);
    try {
      await api.deleteAppClientByTenant(tenantTeamId, tenant, client.id);
      await invalidateAndRefetch(teamId);
      onRefresh();
      toast({ title: 'App client deleted' });
    } catch (e) {
      toast({ title: 'Failed to delete app client', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setDeleteLoading(false);
    }
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 2000); });
  };

  const clientDisplayId = client.clientId ?? client.client_id ?? client.id;
  const jwksUrl = clientDisplayId ? `https://auth.apiblaze.com/${clientDisplayId}/.well-known/jwks.json` : null;
  const callbackUrls = (client.authorizedCallbackUrls ?? client.authorized_callback_urls ?? []) as string[];

  return (
    <div className="rounded-xl border bg-card transition-all">

      {/* ── Collapsed header ── */}
      {!expanded && (
        <div className="flex items-center gap-2 px-4 py-3">
          <button type="button" onClick={handleOpenEdit} className="flex items-center gap-2 flex-1 min-w-0 text-left">
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold truncate">{client.name}</span>
                {isDefault && <Badge variant="secondary" className="text-xs shrink-0">Default</Badge>}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {providers.length > 0 ? (
                  <>
                    {providers.slice(0, 4).map(p => <ProviderIcon key={p.id} id={p.type} size="sm" />)}
                    {providers.length > 4 && <span className="text-xs text-muted-foreground">+{providers.length - 4}</span>}
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground italic">No providers — users can&apos;t log in yet</span>
                )}
              </div>
            </div>
          </button>
          <div className="flex items-center gap-1 shrink-0">
            {!isDefault && (
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={onSetDefault}>
                Set default
              </Button>
            )}
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive/70 hover:text-destructive hover:bg-destructive/10" onClick={handleDeleteClient} disabled={deleteLoading}>
              {deleteLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      )}

      {/* ── Expanded: edit form ── */}
      {expanded && (
        <div className="divide-y">

          {/* Header row */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold truncate">{client.name}</span>
              {isDefault
                ? <Badge variant="secondary" className="text-xs shrink-0">Default</Badge>
                : <button type="button" className="text-xs text-muted-foreground hover:text-foreground shrink-0 transition-colors" onClick={onSetDefault}>Set default</button>
              }
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={handleDeleteClient} disabled={deleteLoading} title="Delete">
                {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setExpanded(false)} title="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* JWKS + Portal links */}
          {(jwksUrl || callbackUrls[0]) && (
            <div className="px-4 py-3 space-y-1 bg-muted/30">
              {jwksUrl && (
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground w-28 shrink-0">JWKS (RS256)</span>
                  <a href={jwksUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline font-mono truncate">
                    {jwksUrl} <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
              )}
              {callbackUrls[0] && (
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground w-28 shrink-0">API Portal Login</span>
                  <a href={callbackUrls[0]} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline font-mono truncate">
                    {callbackUrls[0]} <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Core fields */}
          <div className="px-4 py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Name</Label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label className="text-sm font-medium">Client ID</Label>
                <Input value={clientDisplayId} readOnly className="mt-1.5 font-mono text-muted-foreground bg-muted/60 cursor-default" />
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Authorized Callback URLs</Label>
              <div className="mt-1.5 space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="https://example.com/callback"
                    value={editNewCallbackUrl}
                    onChange={e => setEditNewCallbackUrl(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const u = editNewCallbackUrl.trim();
                        if (u && !editCallbackUrls.includes(u)) { setEditCallbackUrls(prev => [...prev, u]); setEditNewCallbackUrl(''); }
                      }
                    }}
                    className="flex-1"
                  />
                  <Button type="button" className="shrink-0"
                    onClick={() => { const u = editNewCallbackUrl.trim(); if (u && !editCallbackUrls.includes(u)) { setEditCallbackUrls(prev => [...prev, u]); setEditNewCallbackUrl(''); } }}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {editCallbackUrls.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {editCallbackUrls.map((url, i) => (
                      <div key={i} className="flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-mono">
                        {i === 0 && <span className="text-amber-500 shrink-0">★</span>}
                        {i === 0 && <span className="font-medium text-muted-foreground mr-0.5">Default</span>}
                        <span className={i === 0 ? '' : 'truncate max-w-[240px]'}>{url}</span>
                        <button type="button" onClick={() => setEditCallbackUrls(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive shrink-0 ml-0.5">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Branding fields */}
          <div className="px-4 py-4 space-y-4">
            <p className="text-sm font-medium text-muted-foreground">Login Page Branding</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Logo URL</Label>
                <Input placeholder="https://example.com/logo.png" value={editBranding.loginPageLogo ?? ''} onChange={e => setEditBranding(b => ({ ...b, loginPageLogo: e.target.value }))} className="mt-1.5" />
              </div>
              <div>
                <Label className="text-sm font-medium">Header Text</Label>
                <Input placeholder="Login into my API" value={editBranding.loginPageHeaderText ?? ''} onChange={e => setEditBranding(b => ({ ...b, loginPageHeaderText: e.target.value }))} className="mt-1.5" />
              </div>
              <div>
                <Label className="text-sm font-medium">Subtitle</Label>
                <Input placeholder="Get started now" value={editBranding.loginPageSubtitle ?? ''} onChange={e => setEditBranding(b => ({ ...b, loginPageSubtitle: e.target.value }))} className="mt-1.5" />
              </div>
              <div>
                <Label className="text-sm font-medium">Primary Color</Label>
                <div className="flex items-center gap-2 mt-1.5">
                  <input
                    type="color"
                    value={editBranding.primaryColor ?? '#000000'}
                    onChange={e => setEditBranding(b => ({ ...b, primaryColor: e.target.value }))}
                    className="h-9 w-10 rounded border cursor-pointer p-0.5 shrink-0"
                  />
                  <Input
                    placeholder="#000000"
                    value={editBranding.primaryColor ?? ''}
                    onChange={e => setEditBranding(b => ({ ...b, primaryColor: e.target.value }))}
                    className="font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Save / Cancel */}
          <div className="flex gap-2 px-4 py-3">
            <Button type="button" disabled={savingEdit} onClick={handleSaveEdit}>
              {savingEdit && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Save
            </Button>
            <Button type="button" variant="ghost" onClick={() => setExpanded(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* ── OAuth Providers — always visible ── */}
      <div className="px-4 py-3 border-t">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">OAuth Providers</span>
            {providers.length > 0 && (
              <Badge variant="secondary" className="text-xs">{providers.length}</Badge>
            )}
          </div>
          <Button type="button" variant="outline" size="sm"
            onClick={() => { setEditingProviderId(null); setEditProviderInitial({ type: 'google', clientId: '', clientSecret: '', domain: PROVIDER_DOMAINS['google'], scopes: [...DEFAULT_SCOPES['google']], newScope: '' }); setProviderDialogOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Provider
          </Button>
        </div>
        {providers.length === 0 ? (
          <p className="text-xs text-muted-foreground">No providers. Users won&apos;t be able to log in until you add at least one.</p>
        ) : (
          <div className="space-y-2">
            {providers.map(p => {
              const label = PROVIDER_LABELS[p.type as SocialProvider] ?? p.type;
              const clientId = p.clientId ?? p.client_id ?? '';
              const loading = loadingProviderId === p.id;
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5">
                  <ProviderIcon id={p.type} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{label}</p>
                    {p.domain && <p className="text-xs text-muted-foreground truncate">Domain: {p.domain}</p>}
                    {clientId && <p className="text-xs text-muted-foreground truncate">Client ID: {clientId}</p>}
                  </div>
                  <button type="button" onClick={() => handleEditProvider(p)} disabled={loading} className="text-muted-foreground hover:text-foreground transition-colors shrink-0 p-1" title="Edit provider">
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
                  </button>
                  <button type="button" onClick={() => handleDeleteProvider(p)} className="text-destructive/60 hover:text-destructive transition-colors shrink-0 p-1" title="Remove provider">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Provider dialog */}
      {editProviderInitial && (
        <ProviderDialog
          open={providerDialogOpen}
          onOpenChange={o => { setProviderDialogOpen(o); if (!o) { setEditingProviderId(null); setEditProviderInitial(null); } }}
          initial={editProviderInitial}
          isEdit={!!editingProviderId}
          onSave={handleSaveProvider}
          saving={providerSaving}
        />
      )}
    </div>
  );
}

// ─── Tenant Panel (selected tenant's app clients) ─────────────────────────────

function TenantDetail({
  tenant, project, config, updateConfig, teamId, onProjectUpdate,
}: {
  tenant: { tenant_name: string; display_name: string };
  project: Project;
  config: ProjectConfig;
  updateConfig: (u: Partial<ProjectConfig>) => void;
  teamId: string;
  onProjectUpdate?: (p: Project) => void;
}) {
  const { toast } = useToast();
  const getAppClientsForTenant = useDashboardCacheStore(s => s.getAppClientsForTenant);
  const fetchAppClientsForTenant = useDashboardCacheStore(s => s.fetchAppClientsForTenant);
  const invalidateAndRefetch = useDashboardCacheStore(s => s.invalidateAndRefetch);
  const appClientsByConfig = useDashboardCacheStore(s => s.appClientsByConfig);
  const isBootstrapping = useDashboardCacheStore(s => s.isBootstrapping);

  // Add form visibility + accordion for existing clients
  const [showAdd, setShowAdd] = useState(false);
  const [existingExpanded, setExistingExpanded] = useState(true);

  // New client form fields
  const [newName, setNewName] = useState('');
  const [newCallbackUrls, setNewCallbackUrls] = useState<string[]>([]);
  const [newCallbackUrlInput, setNewCallbackUrlInput] = useState('');
  const [newBranding, setNewBranding] = useState<AppClientBranding>({});
  const [creating, setCreating] = useState(false);

  // Provider selection in new client form
  const [newBringOwn, setNewBringOwn] = useState(false);
  const [newProviderType, setNewProviderType] = useState<SocialProvider>('google');
  const [newProvClientId, setNewProvClientId] = useState('');
  const [newProvClientSecret, setNewProvClientSecret] = useState('');
  // Provider advanced settings
  const [newAdvShow, setNewAdvShow] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [newTokenType, setNewTokenType] = useState<'apiblaze' | 'thirdParty'>('apiblaze');
  const [newTargetServerToken, setNewTargetServerToken] = useState<'apiblaze' | 'third_party_access_token' | 'third_party_id_token' | 'none'>('apiblaze');
  const [newScopes, setNewScopes] = useState<string[]>([]);
  const [newScopeInput, setNewScopeInput] = useState('');

  const appClients = useMemo(
    () => getAppClientsForTenant(teamId, tenant.tenant_name) as AppClientRaw[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teamId, tenant.tenant_name, getAppClientsForTenant, appClientsByConfig]
  );

  useEffect(() => {
    if (!isBootstrapping) fetchAppClientsForTenant(teamId, tenant.tenant_name);
  }, [teamId, tenant.tenant_name, isBootstrapping, fetchAppClientsForTenant]);

  const defaultCallbackUrl = `https://${project.project_id}-${tenant.tenant_name}.portal.apiblaze.com/${project.api_version}`;

  const openAdd = () => {
    setNewCallbackUrls([defaultCallbackUrl]);
    setShowAdd(true);
    setExistingExpanded(false);
  };

  const closeAdd = () => {
    setShowAdd(false);
    setExistingExpanded(true);
    setNewName(''); setNewCallbackUrls([]); setNewCallbackUrlInput(''); setNewBranding({});
    setNewBringOwn(false); setNewProviderType('google');
    setNewProvClientId(''); setNewProvClientSecret('');
    setNewAdvShow(false); setNewDomain(''); setNewTokenType('apiblaze');
    setNewTargetServerToken('apiblaze'); setNewScopes([]); setNewScopeInput('');
  };

  const selectNewProvider = (own: boolean, p: SocialProvider) => {
    setNewBringOwn(own);
    if (own) {
      setNewProviderType(p);
      setNewDomain(PROVIDER_DOMAINS[p] ?? '');
      setNewScopes([...DEFAULT_SCOPES[p]]);
      setNewAdvShow(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const client = await api.createAppClientForTenant(teamId, tenant.tenant_name, {
        name: newName.trim(),
        tenant: tenant.tenant_name,
        scopes: newBringOwn ? DEFAULT_SCOPES[newProviderType] : ['read:user', 'user:email'],
        authorizedCallbackUrls: newCallbackUrls.length > 0 ? newCallbackUrls : [defaultCallbackUrl],
        branding: newBranding,
        projectName: project.project_id,
        apiVersion: project.api_version || '1.0.0',
      });
      const newClientId = (client as { id?: string }).id ?? '';
      if (newBringOwn && newProvClientId.trim() && newProvClientSecret.length >= CLIENT_SECRET_MIN_LENGTH && newClientId) {
        await api.addProviderByTenant(teamId, tenant.tenant_name, newClientId, {
          type: newProviderType,
          clientId: newProvClientId.trim(),
          clientSecret: newProvClientSecret,
          scopes: newScopes.length > 0 ? newScopes : DEFAULT_SCOPES[newProviderType],
          domain: newDomain || PROVIDER_DOMAINS[newProviderType],
          tokenType: newTokenType,
          targetServerToken: newTargetServerToken,
          includeApiblazeAccessTokenHeader: false,
          includeApiblazeIdTokenHeader: false,
        });
      }
      await invalidateAndRefetch(teamId);
      if (appClients.length === 0 || !config.defaultAppClient) {
        updateConfig({ defaultAppClient: newClientId });
        try { await updateProjectConfig(project.project_id, project.api_version, { default_app_client_id: newClientId }); onProjectUpdate?.({ ...project }); } catch { /* non-fatal */ }
      }
      closeAdd();
      toast({ title: 'App client created', description: newBringOwn && newProvClientId.trim() ? 'Provider added.' : 'Add an OAuth provider to enable user login.' });
    } catch (e) {
      toast({ title: 'Failed to create app client', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleSetDefault = async (clientId: string) => {
    updateConfig({ defaultAppClient: clientId });
    try { await updateProjectConfig(project.project_id, project.api_version, { default_app_client_id: clientId }); onProjectUpdate?.({ ...project }); } catch { /* non-fatal */ }
  };

  const ADD_PROVIDERS = [
    { id: 'apiblaze', label: 'APIBlaze', own: false, p: 'github' as SocialProvider },
    { id: 'google',   label: 'Google',   own: true,  p: 'google'    as SocialProvider },
    { id: 'github',   label: 'GitHub',   own: true,  p: 'github'    as SocialProvider },
    { id: 'microsoft',label: 'Microsoft',own: true,  p: 'microsoft' as SocialProvider },
    { id: 'facebook', label: 'Facebook', own: true,  p: 'facebook'  as SocialProvider },
    { id: 'auth0',    label: 'Auth0',    own: true,  p: 'auth0'     as SocialProvider },
    { id: 'other',    label: 'Custom',   own: true,  p: 'other'     as SocialProvider },
  ];

  return (
    <div className="space-y-3">

      {/* ── Section header ── */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">AppClients</span>
        {!showAdd && (
          <Button type="button" variant="outline" size="sm" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add AppClient
          </Button>
        )}
      </div>

      {/* ── Add form ── */}
      {showAdd && (
        <>
        <div className="rounded-xl border bg-card divide-y">

          {/* Form header */}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-semibold">New AppClient</span>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={closeAdd}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Name */}
          <div className="px-4 py-4 space-y-4">
            <div>
              <Label className="text-sm font-medium">Name</Label>
              <Input placeholder="e.g. my-web-app" value={newName} onChange={e => setNewName(e.target.value)} className="mt-1.5" />
            </div>

            {/* Authorized Callback URLs */}
            <div>
              <Label className="text-sm font-medium">Authorized Callback URLs</Label>
              <div className="mt-1.5 space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="https://example.com/callback"
                    value={newCallbackUrlInput}
                    onChange={e => setNewCallbackUrlInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const u = newCallbackUrlInput.trim();
                        if (u && !newCallbackUrls.includes(u)) { setNewCallbackUrls(prev => [...prev, u]); setNewCallbackUrlInput(''); }
                      }
                    }}
                    className="flex-1"
                  />
                  <Button type="button" className="shrink-0"
                    onClick={() => { const u = newCallbackUrlInput.trim(); if (u && !newCallbackUrls.includes(u)) { setNewCallbackUrls(prev => [...prev, u]); setNewCallbackUrlInput(''); } }}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {newCallbackUrls.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {newCallbackUrls.map((url, i) => (
                      <div key={i} className="flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-mono">
                        {i === 0 && <span className="text-amber-500 shrink-0">★</span>}
                        {i === 0 && <span className="font-medium text-muted-foreground mr-0.5">Default</span>}
                        <span>{url}</span>
                        <button type="button" onClick={() => setNewCallbackUrls(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive shrink-0 ml-0.5">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Login Page Branding */}
          <div className="px-4 py-4 space-y-4">
            <p className="text-sm font-medium text-muted-foreground">Login Page Branding</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Logo URL</Label>
                <Input placeholder="https://example.com/logo.png" value={newBranding.loginPageLogo ?? ''} onChange={e => setNewBranding(b => ({ ...b, loginPageLogo: e.target.value }))} className="mt-1.5" />
              </div>
              <div>
                <Label className="text-sm font-medium">Header Text</Label>
                <Input placeholder="Login into my API" value={newBranding.loginPageHeaderText ?? ''} onChange={e => setNewBranding(b => ({ ...b, loginPageHeaderText: e.target.value }))} className="mt-1.5" />
              </div>
              <div>
                <Label className="text-sm font-medium">Subtitle</Label>
                <Input placeholder="Get started now" value={newBranding.loginPageSubtitle ?? ''} onChange={e => setNewBranding(b => ({ ...b, loginPageSubtitle: e.target.value }))} className="mt-1.5" />
              </div>
              <div>
                <Label className="text-sm font-medium">Primary Color</Label>
                <div className="flex items-center gap-2 mt-1.5">
                  <input
                    type="color"
                    value={newBranding.primaryColor ?? '#000000'}
                    onChange={e => setNewBranding(b => ({ ...b, primaryColor: e.target.value }))}
                    className="h-9 w-10 rounded border cursor-pointer p-0.5 shrink-0"
                  />
                  <Input
                    placeholder="#000000"
                    value={newBranding.primaryColor ?? ''}
                    onChange={e => setNewBranding(b => ({ ...b, primaryColor: e.target.value }))}
                    className="font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Provider selector */}
          <div className="px-4 py-4 space-y-3">
            <Label className="text-sm font-medium">Identity Provider</Label>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {ADD_PROVIDERS.map(opt => {
                const sel = opt.own ? (newBringOwn && newProviderType === opt.p) : !newBringOwn;
                return (
                  <button key={opt.id} type="button"
                    onClick={() => selectNewProvider(opt.own, opt.p)}
                    className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 text-xs font-medium transition-all ${sel ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/40'}`}
                  >
                    <ProviderIcon id={opt.id} size="md" />
                    <span className="leading-tight text-center">{opt.label}</span>
                    {sel && <Check className="h-3 w-3 text-primary" />}
                  </button>
                );
              })}
            </div>

            {!newBringOwn && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/50 border text-xs text-muted-foreground">
                <ProviderIcon id="apiblaze" size="sm" />
                <span>APIBlaze&apos;s built-in GitHub OAuth — zero setup required. Users log in with their GitHub account. You can add your own provider after creating.</span>
              </div>
            )}

            {newBringOwn && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-medium">Client ID</Label>
                    <Input placeholder="OAuth client ID" value={newProvClientId} onChange={e => setNewProvClientId(e.target.value)} className="mt-1.5" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Client Secret</Label>
                    <Input type="password" placeholder="OAuth client secret" value={newProvClientSecret} onChange={e => setNewProvClientSecret(e.target.value)} className="mt-1.5" />
                    {newProvClientSecret.length > 0 && newProvClientSecret.length < CLIENT_SECRET_MIN_LENGTH && (
                      <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Min {CLIENT_SECRET_MIN_LENGTH} chars</p>
                    )}
                  </div>
                </div>

                <button type="button" onClick={() => setNewAdvShow(v => !v)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  {newAdvShow ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Advanced settings
                </button>

                {newAdvShow && (
                  <div className="pl-4 border-l-2 border-muted space-y-4">
                    <div>
                      <Label className="text-xs">Identity provider domain</Label>
                      <Input placeholder={PROVIDER_DOMAINS[newProviderType] || 'https://your-domain.example.com'} value={newDomain} onChange={e => setNewDomain(e.target.value)} className="mt-1 text-xs" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium">Client side token type</Label>
                      <p className="text-xs text-muted-foreground mb-1">Tokens the API users will see</p>
                      <Select value={newTokenType} onValueChange={v => setNewTokenType(v as 'apiblaze' | 'thirdParty')}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="apiblaze">API Blaze JWT token</SelectItem>
                          <SelectItem value="thirdParty">Third Party</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {newTokenType !== 'thirdParty' && (
                      <div>
                        <Label className="text-xs font-medium">Target server token type</Label>
                        <p className="text-xs text-muted-foreground mb-1">What to send in the Authorization header to your target servers</p>
                        <Select value={newTargetServerToken} onValueChange={v => setNewTargetServerToken(v as 'apiblaze' | 'third_party_access_token' | 'third_party_id_token' | 'none')}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="apiblaze">API Blaze JWT token</SelectItem>
                            <SelectItem value="third_party_access_token">{PROVIDER_LABELS[newProviderType]} access token</SelectItem>
                            <SelectItem value="third_party_id_token">{PROVIDER_LABELS[newProviderType]} ID token</SelectItem>
                            <SelectItem value="none">None</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div>
                      <Label className="text-xs font-medium">Authorized Scopes</Label>
                      <p className="text-xs text-muted-foreground mb-1">Default scopes for {PROVIDER_LABELS[newProviderType]}: {DEFAULT_SCOPES[newProviderType].join(', ')}</p>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {newScopes.map(s => (
                          <Badge key={s} variant="secondary" className="gap-1 text-xs">
                            {s}
                            <button type="button" onClick={() => setNewScopes(prev => prev.filter(x => x !== s))}><X className="h-3 w-3" /></button>
                          </Badge>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Input placeholder="Add custom scope" value={newScopeInput} onChange={e => setNewScopeInput(e.target.value)} className="h-8 text-xs"
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newScopeInput.trim() && !newScopes.includes(newScopeInput.trim())) { setNewScopes(prev => [...prev, newScopeInput.trim()]); setNewScopeInput(''); } } }} />
                        <Button type="button" size="sm" className="h-8" onClick={() => { if (newScopeInput.trim() && !newScopes.includes(newScopeInput.trim())) { setNewScopes(prev => [...prev, newScopeInput.trim()]); setNewScopeInput(''); } }}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 px-4 py-3">
            <Button type="button" disabled={!newName.trim() || creating} onClick={handleCreate}>
              {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Create
            </Button>
            <Button type="button" variant="ghost" onClick={closeAdd}>Cancel</Button>
          </div>
        </div>

        {/* Existing clients — detached accordion */}
        {appClients.length > 0 && (
          <button
            type="button"
            onClick={() => setExistingExpanded(v => !v)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/30 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            {existingExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {appClients.length} existing app client{appClients.length !== 1 ? 's' : ''}
          </button>
        )}
        </>
      )}

      {/* ── Existing clients list ── */}
      {appClients.length === 0 && !showAdd ? (
        <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
          <p className="text-sm font-medium">No app clients yet</p>
          <p className="text-xs text-muted-foreground">Create one to set up a login page and OAuth providers for this tenant.</p>
          <Button type="button" variant="outline" size="sm" className="mt-1" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1.5" /> Add AppClient
          </Button>
        </div>
      ) : existingExpanded ? (
        <div className="space-y-3">
          {appClients.map((client, index) => (
            <AppClientPanel
              key={client.id}
              client={client}
              tenantTeamId={teamId}
              tenant={tenant.tenant_name}
              teamId={teamId}
              config={config}
              project={project}
              onRefresh={() => fetchAppClientsForTenant(teamId, tenant.tenant_name)}
              isDefault={config.defaultAppClient === client.id}
              onSetDefault={() => handleSetDefault(client.id)}
              defaultExpanded={index === 0}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── Edit Mode: Tenant Manager ────────────────────────────────────────────────

function EditModeTenantManager({
  config, updateConfig, project, onProjectUpdate, teamId,
}: {
  config: ProjectConfig;
  updateConfig: (u: Partial<ProjectConfig>) => void;
  project: Project;
  onProjectUpdate?: (p: Project) => void;
  teamId: string;
}) {
  const { toast } = useToast();
  const [attachedTenants, setAttachedTenants] = useState<Array<{ tenant_name: string; display_name: string }>>([]);
  const [teamTenants, setTeamTenants] = useState<Array<{ tenant_name: string; display_name?: string }>>([]);
  const [selected, setSelected] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);

  // Create tenant form state
  const [slug, setSlug] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [clientName, setClientName] = useState('');
  const [providerType, setProviderType] = useState<SocialProvider>('google');
  const [bringOwn, setBringOwn] = useState(false);
  const [provClientId, setProvClientId] = useState('');
  const [provClientSecret, setProvClientSecret] = useState('');
  const [creating, setCreating] = useState(false);

  // Detach dialog
  const [detachTarget, setDetachTarget] = useState<{ tenant_name: string; display_name: string } | null>(null);
  const [detachConfirm, setDetachConfirm] = useState('');
  const [detachLoading, setDetachLoading] = useState(false);
  const [attachLoading, setAttachLoading] = useState(false);

  const fetchProjectTenants = useDashboardCacheStore(s => s.fetchProjectTenants);
  const invalidateProjectTenants = useDashboardCacheStore(s => s.invalidateProjectTenants);
  const projectTenantsByProject = useDashboardCacheStore(s => s.projectTenantsByProject);

  useEffect(() => {
    fetchProjectTenants(project.project_id, project.api_version);
  }, [project.project_id, project.api_version]);

  useEffect(() => {
    const list = projectTenantsByProject[`${project.project_id}:${project.api_version}`];
    if (!list) return;
    setAttachedTenants(list);
    setSelected(prev => list.some(t => t.tenant_name === prev) ? prev : (list[0]?.tenant_name ?? ''));
  }, [project.project_id, project.api_version, projectTenantsByProject]);

  useEffect(() => {
    api.getTeamTenants(teamId, true)
      .then(res => {
        const t = res.tenants;
        if (!Array.isArray(t) || t.length === 0) { setTeamTenants([]); return; }
        const list = typeof t[0] === 'string'
          ? (t as string[]).map(tn => ({ tenant_name: tn, display_name: tn }))
          : (t as { tenant_name: string; display_name?: string }[]).map(x => ({ tenant_name: x.tenant_name, display_name: x.display_name ?? x.tenant_name }));
        setTeamTenants(list);
      })
      .catch(() => { });
  }, [teamId]);

  const availableToAttach = useMemo(() => {
    const attached = new Set(attachedTenants.map(t => t.tenant_name));
    return teamTenants.filter(t => !attached.has(t.tenant_name));
  }, [teamTenants, attachedTenants]);

  const resetCreateForm = () => {
    setSlug(''); setDisplayName(''); setClientName('');
    setBringOwn(false); setProviderType('google'); setProvClientId(''); setProvClientSecret('');
  };

  const handleCreate = async () => {
    const tenantSlug = slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 32);
    const tenantDisplay = displayName.trim() || tenantSlug;
    if (!tenantSlug || !tenantDisplay) return;
    setCreating(true);
    try {
      await api.createTeamTenant(teamId, { tenant_name: tenantSlug, display_name: tenantDisplay });
      await api.attachTenantToProject(project.project_id, project.api_version, { tenant_name: tenantSlug, display_name: tenantDisplay });
      const appClient = await api.createAppClientForTenant(teamId, tenantSlug, {
        name: clientName.trim() || `${tenantSlug}-client`,
        projectName: project.project_id,
        apiVersion: project.api_version || '1.0.0',
        tenant: tenantSlug,
        scopes: bringOwn ? DEFAULT_SCOPES[providerType] : ['read:user', 'user:email'],
        authorizedCallbackUrls: [`https://${project.project_id}-${tenantSlug}.portal.apiblaze.com/${project.api_version}`],
      });
      if (bringOwn && provClientId.trim() && provClientSecret.length >= CLIENT_SECRET_MIN_LENGTH) {
        const appClientId = (appClient as { id?: string }).id ?? '';
        if (appClientId) {
          await api.addProviderByTenant(teamId, tenantSlug, appClientId, {
            type: providerType,
            clientId: provClientId.trim(),
            clientSecret: provClientSecret,
            scopes: DEFAULT_SCOPES[providerType],
            domain: PROVIDER_DOMAINS[providerType],
            tokenType: 'apiblaze',
            targetServerToken: 'apiblaze',
            includeApiblazeAccessTokenHeader: false,
            includeApiblazeIdTokenHeader: false,
          });
        }
      }
      invalidateProjectTenants(project.project_id, project.api_version);
      await fetchProjectTenants(project.project_id, project.api_version);
      setSelected(tenantSlug);
      setShowCreate(false);
      resetCreateForm();
      onProjectUpdate?.({ ...project });
      toast({ title: 'Tenant created', description: `${tenantDisplay} is ready.` });
    } catch (e) {
      toast({ title: 'Failed to create tenant', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleDetach = async () => {
    if (!detachTarget || detachConfirm !== detachTarget.tenant_name) return;
    setDetachLoading(true);
    try {
      await api.detachTenantFromProject(project.project_id, project.api_version, detachTarget.tenant_name);
      invalidateProjectTenants(project.project_id, project.api_version);
      await fetchProjectTenants(project.project_id, project.api_version);
      const refreshed = useDashboardCacheStore.getState().getProjectTenants(project.project_id, project.api_version);
      setSelected(refreshed[0]?.tenant_name ?? '');
      setDetachTarget(null); setDetachConfirm('');
      onProjectUpdate?.({ ...project });
      toast({ title: 'Tenant removed from project' });
    } catch (e) {
      toast({ title: 'Failed to remove tenant', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setDetachLoading(false);
    }
  };

  const selectedTenantObj = attachedTenants.find(t => t.tenant_name === selected);

  return (
    <div className="space-y-6">

      {/* Tenant selector bar */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <Label className="text-sm font-semibold">Tenants</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Each tenant has its own URL, login page, app clients and providers.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {availableToAttach.length > 0 && (
              <select
                className="text-xs border rounded-md px-2 py-1.5 bg-background cursor-pointer"
                value=""
                onChange={async e => {
                  const t = availableToAttach.find(x => x.tenant_name === e.target.value);
                  if (!t) return;
                  setAttachLoading(true);
                  try {
                    await api.attachTenantToProject(project.project_id, project.api_version, { tenant_name: t.tenant_name, display_name: t.display_name ?? t.tenant_name });
                    invalidateProjectTenants(project.project_id, project.api_version);
                    await fetchProjectTenants(project.project_id, project.api_version);
                    setSelected(t.tenant_name);
                  } catch { toast({ title: 'Failed to attach tenant', variant: 'destructive' }); }
                  finally { setAttachLoading(false); }
                }}
              >
                <option value="" disabled>{attachLoading ? 'Attaching…' : '+ Attach existing'}</option>
                {availableToAttach.map(t => <option key={t.tenant_name} value={t.tenant_name}>{t.display_name ?? t.tenant_name}</option>)}
              </select>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate(v => !v)}>
              <Plus className="h-4 w-4 mr-1.5" /> {showCreate ? 'Cancel' : 'New tenant'}
            </Button>
          </div>
        </div>

        {/* Pill tabs */}
        {attachedTenants.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachedTenants.map(t => (
              <div
                key={t.tenant_name}
                className={`group flex items-center gap-1.5 rounded-full border px-3 py-1.5 cursor-pointer transition-all select-none ${selected === t.tenant_name ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-background border-muted hover:border-muted-foreground/50'}`}
                onClick={() => setSelected(t.tenant_name)}
              >
                <span className="text-sm font-medium">{t.display_name}</span>
                {t.tenant_name !== 'api' && (
                  <button
                    type="button"
                    className={`ml-0.5 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${selected === t.tenant_name ? 'hover:bg-white/20' : 'hover:bg-muted'}`}
                    onClick={e => { e.stopPropagation(); setDetachTarget(t); setDetachConfirm(''); }}
                    title="Remove from project"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {attachedTenants.length === 0 && !showCreate && (
          <p className="text-sm text-muted-foreground">No tenants attached yet.</p>
        )}
      </div>

      {/* Inline create tenant form */}
      {showCreate && (
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Create new tenant</CardTitle>
            <CardDescription className="text-xs">Set up an isolated auth environment with its own URL and login page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Identity */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tenant</Label>
                <Input placeholder="e.g. acme" value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} className="mt-1 font-mono" />
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                  {project.project_id}-<span className="text-foreground">{slug || 'tenant'}</span>.apiblaze.com
                </p>
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Input placeholder="e.g. Acme Corp" value={displayName} onChange={e => setDisplayName(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">App client name <span className="text-muted-foreground">(optional)</span></Label>
              <Input placeholder={slug ? `${slug}-client` : 'e.g. main-client'} value={clientName} onChange={e => setClientName(e.target.value)} className="mt-1 max-w-xs" />
            </div>

            <Separator />

            {/* Provider */}
            <div>
              <Label className="text-xs font-medium">Identity provider <span className="text-muted-foreground">(optional — you can add providers later)</span></Label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
                {[
                  { id: 'apiblaze', label: 'APIBlaze', own: false, p: 'github' as SocialProvider },
                  { id: 'google', label: 'Google', own: true, p: 'google' as SocialProvider },
                  { id: 'github', label: 'GitHub', own: true, p: 'github' as SocialProvider },
                  { id: 'microsoft', label: 'Microsoft', own: true, p: 'microsoft' as SocialProvider },
                  { id: 'facebook', label: 'Facebook', own: true, p: 'facebook' as SocialProvider },
                  { id: 'auth0', label: 'Auth0', own: true, p: 'auth0' as SocialProvider },
                  { id: 'other', label: 'Custom', own: true, p: 'other' as SocialProvider },
                  { id: 'skip', label: 'Skip for now', own: false, p: null as SocialProvider | null },
                ].map(opt => {
                  const sel = opt.id === 'skip'
                    ? !bringOwn && providerType === 'google' && !attachedTenants.some(t => t.tenant_name === 'apiblaze')
                    : opt.own ? (bringOwn && providerType === opt.p) : (!bringOwn && opt.id !== 'skip');
                  return (
                    <button key={opt.id} type="button"
                      onClick={() => {
                        if (opt.id === 'skip') { setBringOwn(false); }
                        else if (opt.own) { setBringOwn(true); setProviderType(opt.p!); }
                        else { setBringOwn(false); setProviderType('github'); }
                      }}
                      className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 text-xs transition-all ${sel ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/40'}`}
                    >
                      {opt.id === 'skip' ? <X className="h-4 w-4 text-muted-foreground" /> : <ProviderIcon id={opt.id} size="sm" />}
                      <span className="text-center leading-tight">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {bringOwn && (
              <div className="space-y-3 p-3 rounded-lg border bg-background">
                <div className="flex items-center gap-2">
                  <ProviderIcon id={providerType} size="sm" />
                  <Label className="text-sm font-semibold">{PROVIDER_LABELS[providerType]} credentials</Label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Client ID</Label>
                    <Input placeholder="OAuth client ID" value={provClientId} onChange={e => setProvClientId(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Client Secret</Label>
                    <Input type="password" placeholder="OAuth client secret" value={provClientSecret} onChange={e => setProvClientSecret(e.target.value)} className="mt-1" />
                    {provClientSecret.length > 0 && provClientSecret.length < CLIENT_SECRET_MIN_LENGTH && (
                      <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Min {CLIENT_SECRET_MIN_LENGTH} chars</p>
                    )}
                  </div>
                </div>
                {slug && (
                  <div className="flex items-start gap-2 p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                    <span>
                      Register this callback URL with your provider:{' '}
                      <code className="font-mono">{`https://${project.project_id}-${slug}.portal.apiblaze.com/${project.api_version}`}</code>
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button type="button" size="sm" disabled={creating || !slug.trim() || !displayName.trim()} onClick={handleCreate}>
                {creating && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />} Create tenant
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setShowCreate(false); resetCreateForm(); }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Selected tenant's detail */}
      {selectedTenantObj && !showCreate && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Shield className="h-4 w-4 text-primary shrink-0" />
            <Label className="text-sm font-semibold">
              {selectedTenantObj.display_name}
              <span className="font-normal text-muted-foreground ml-1">({selectedTenantObj.tenant_name})</span>
            </Label>
            <Badge variant="outline" className="text-xs font-mono ml-auto">{project.project_id}-{selectedTenantObj.tenant_name}.apiblaze.com</Badge>
          </div>
          <TenantDetail
            tenant={selectedTenantObj}
            project={project}
            config={config}
            updateConfig={updateConfig}
            teamId={teamId}
            onProjectUpdate={onProjectUpdate}
          />
        </div>
      )}

      {/* Detach confirmation dialog */}
      <Dialog open={!!detachTarget} onOpenChange={o => { if (!o) { setDetachTarget(null); setDetachConfirm(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove tenant from project</DialogTitle>
            <DialogDescription>
              Removes &ldquo;{detachTarget?.display_name}&rdquo; from this project. The tenant and its app clients are not deleted — they can be re-attached later.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Type <code className="bg-muted px-1 rounded">{detachTarget?.tenant_name}</code> to confirm</Label>
            <Input value={detachConfirm} onChange={e => setDetachConfirm(e.target.value)} placeholder={detachTarget?.tenant_name ?? ''} className="mt-1 font-mono" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetachTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={detachConfirm !== (detachTarget?.tenant_name ?? '') || detachLoading} onClick={handleDetach}>
              {detachLoading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />} Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function AuthenticationSection({
  config, updateConfig, isEditMode = false, project, onProjectUpdate, teamId,
  selectedAuthTenant, onAuthTenantChange,
}: {
  config: ProjectConfig;
  updateConfig: (updates: Partial<ProjectConfig>) => void;
  isEditMode?: boolean;
  project?: Project | null;
  onProjectUpdate?: (updatedProject: Project) => void;
  teamId?: string;
  selectedAuthTenant?: string;
  onAuthTenantChange?: (tenant: string) => void;
}) {
  const projectTeamId = (project as { team_id?: string })?.team_id ?? teamId;
  const { toast } = useToast();
  const [attachedTenants, setAttachedTenants] = useState<Array<{ tenant_name: string; display_name: string }>>(
    () => isEditMode ? [] : [{ tenant_name: 'api', display_name: 'Default (api)' }]
  );
  // Internal selection state — used when parent doesn't control selectedAuthTenant (e.g. create-project-dialog)
  // Edit mode: starts empty so auth config waits for tenant list to load. Create mode: 'api' default.
  const [internalSelectedTenant, setInternalSelectedTenant] = useState<string>(isEditMode ? '' : 'api');
  const effectiveTenant = selectedAuthTenant || internalSelectedTenant;
  const handleTenantChange = (v: string) => { setInternalSelectedTenant(v); onAuthTenantChange?.(v); };
  const [tenantAuthLoading, setTenantAuthLoading] = useState(false);
  const [showAddTenant, setShowAddTenant] = useState(false);
  const [showNewTenantDialog, setShowNewTenantDialog] = useState(false);
  const [newTenantSlug, setNewTenantSlug] = useState('');
  const [newTenantDisplay, setNewTenantDisplay] = useState('');
  const [addingTenant, setAddingTenant] = useState(false);

  // Project ID to use for URL display (real in edit mode, config name in create mode)
  const displayProjectId = project?.project_id ?? config.projectName ?? '';
  const displayVersion = project?.api_version ?? config.apiVersion ?? '';

  const fetchProjectTenants = useDashboardCacheStore(s => s.fetchProjectTenants);
  const invalidateProjectTenants = useDashboardCacheStore(s => s.invalidateProjectTenants);
  const projectTenantsByProject = useDashboardCacheStore(s => s.projectTenantsByProject);

  const refreshTenants = async (selectSlug?: string) => {
    if (!project) return;
    invalidateProjectTenants(project.project_id, project.api_version);
    await fetchProjectTenants(project.project_id, project.api_version);
    // Read fresh from store — closure's projectTenantsByProject is stale after invalidate+fetch
    const list = useDashboardCacheStore.getState().getProjectTenants(project.project_id, project.api_version);
    if (selectSlug) {
      handleTenantChange(selectSlug);
    } else if (!effectiveTenant && list.length > 0) {
      handleTenantChange(list[0].tenant_name);
    }
  };

  // Sync attachedTenants from store
  useEffect(() => {
    const list = projectTenantsByProject[`${project?.project_id}:${project?.api_version}`];
    if (list) setAttachedTenants(list);
  }, [project?.project_id, project?.api_version, projectTenantsByProject]);

  // Load project tenants when in edit mode
  useEffect(() => {
    if (!isEditMode || !project) return;
    fetchProjectTenants(project.project_id, project.api_version);
  }, [isEditMode, project?.project_id, project?.api_version]);

  // Load tenant auth config when selected tenant changes
  useEffect(() => {
    if (!isEditMode || !project || !effectiveTenant) return;
    setTenantAuthLoading(true);
    api.getTenantAuthConfig(project.project_id, project.api_version, effectiveTenant)
      .then(tenantAuth => {
        const ra = tenantAuth.requests_auth as Record<string, unknown> | null;
        // If tenant has no explicit auth config, keep the project-level defaults already in state
        if (ra === null) return;
        const mode = (ra?.mode as 'authenticate' | 'passthrough') ?? 'passthrough';
        const methods = (ra?.methods as ('jwt' | 'opaque' | 'api_key')[]) ?? ['jwt'];
        const jwt = ra?.jwt as Record<string, unknown> | undefined;
        const pairs = (jwt?.allowed_pairs as Array<{ iss?: string; aud?: string }> | undefined) ?? [];
        const opaque = ra?.opaque as Record<string, unknown> | undefined;
        const apiKey = ra?.api_key as Record<string, unknown> | undefined;
        updateConfig({
          requestsAuthMode: mode,
          requestsAuthMethods: methods,
          allowedPairs: pairs.filter(p => p?.iss && p?.aud).map(p => ({ iss: p.iss!, aud: p.aud! })),
          opaqueTokenEndpoint: (opaque?.endpoint as string) ?? '',
          opaqueTokenMethod: (opaque?.method as 'GET' | 'POST') ?? 'GET',
          opaqueTokenParams: (opaque?.params as string) ?? '?access_token={token}',
          opaqueTokenBody: (opaque?.body as string) ?? 'token={token}',
          requireApiKeyXEndUserId: (apiKey?.require_x_end_user_id as boolean) ?? false,
          defaultAppClient: tenantAuth.default_app_client_id ?? undefined,
        });
      })
      .catch(() => {
        // Request failed — leave current config in place rather than resetting to defaults
      })
      .finally(() => setTenantAuthLoading(false));
  }, [isEditMode, effectiveTenant, project?.project_id, project?.api_version]);

  const handleAddTenant = async () => {
    const slug = newTenantSlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 32);
    const display = newTenantDisplay.trim() || slug;
    if (!slug) return;

    // Create mode: create team tenant immediately, then add to local list
    if (!isEditMode) {
      if (attachedTenants.some(t => t.tenant_name === slug)) {
        toast({ title: 'Tenant already exists', variant: 'destructive' });
        return;
      }
      if (!projectTeamId) {
        toast({ title: 'Not signed in', variant: 'destructive' });
        return;
      }
      setAddingTenant(true);
      try {
        await api.createTeamTenant(projectTeamId, { tenant_name: slug, display_name: display });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.toLowerCase().includes('already')) {
          toast({ title: 'Failed to create tenant', description: msg, variant: 'destructive' });
          setAddingTenant(false);
          return;
        }
      } finally {
        setAddingTenant(false);
      }
      setAttachedTenants(prev => [...prev, { tenant_name: slug, display_name: display }]);
      handleTenantChange(slug);
      setShowAddTenant(false);
      setNewTenantSlug('');
      setNewTenantDisplay('');
      toast({ title: 'Tenant created', description: `${display} is ready. Deploy to attach it to the project.` });
      return;
    }

    if (!project || !projectTeamId) return;
    setAddingTenant(true);
    try {
      await api.createTeamTenant(projectTeamId, { tenant_name: slug, display_name: display });
      await api.attachTenantToProject(project.project_id, project.api_version, { tenant_name: slug, display_name: display });
      refreshTenants(slug);
      setShowAddTenant(false);
      setNewTenantSlug('');
      setNewTenantDisplay('');
      toast({ title: 'Tenant added', description: `${display} is now scoped below.` });
    } catch (e) {
      toast({ title: 'Failed to add tenant', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setAddingTenant(false);
    }
  };

  const [bannerCopied, setBannerCopied] = useState(false);
  const activeTenantObj = attachedTenants.find(t => t.tenant_name === effectiveTenant);
  const activeTenantSlug = effectiveTenant;
  const proxyUrl = (displayProjectId && activeTenantSlug)
    ? `${displayProjectId}-${activeTenantSlug}.apiblaze.com/${displayVersion}`
    : null;
  const copyProxyUrl = () => {
    if (!proxyUrl) return;
    navigator.clipboard?.writeText(`https://${proxyUrl}`).then(() => {
      setBannerCopied(true);
      setTimeout(() => setBannerCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-8">
      {/* ── Tenant scope banner ── */}
      <div className="space-y-2">
        <div className="rounded-xl border-2 border-primary/20 bg-primary/5 px-4 py-3 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 shrink-0">
              <Shield className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-semibold text-primary whitespace-nowrap">Tenant</span>
            </div>
            <div className="flex items-center gap-2 flex-1 flex-wrap">
              {attachedTenants.length > 0 ? (
                <Select
                  value={(activeTenantSlug || attachedTenants[0]?.tenant_name) ?? ''}
                  onValueChange={handleTenantChange}
                >
                  <SelectTrigger className="h-8 w-auto min-w-[160px] text-sm font-semibold bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {attachedTenants.map(t => (
                      <SelectItem key={t.tenant_name} value={t.tenant_name}>
                        {t.display_name && t.display_name !== t.tenant_name
                          ? (t.display_name.endsWith(`(${t.tenant_name})`) ? t.display_name : `${t.display_name} (${t.tenant_name})`)
                          : t.tenant_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm text-muted-foreground italic">No tenants yet</span>
              )}
              {tenantAuthLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {/* Proxy URL — collated right next to dropdown */}
              {activeTenantSlug && (
                <div className="flex items-center gap-1 rounded-lg border bg-background px-2 py-1 text-xs font-mono shrink-0">
                  <span className="text-muted-foreground">https://{displayProjectId || '{project}'}-</span>
                  <span className="text-primary font-semibold">{activeTenantSlug}</span>
                  <span className="text-muted-foreground">.apiblaze.com</span>
                  {proxyUrl && (
                    <button type="button" onClick={copyProxyUrl} className="ml-1 text-muted-foreground hover:text-foreground shrink-0" title="Copy URL">
                      {bannerCopied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                    </button>
                  )}
                </div>
              )}
            </div>

            {!showAddTenant && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0"
                onClick={() => isEditMode ? setShowNewTenantDialog(true) : setShowAddTenant(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />New tenant
              </Button>
            )}
          </div>
          <p className="text-xs text-primary/70">
            All settings below — request auth and login page — apply to the selected tenant
            {activeTenantObj ? <strong className="font-semibold"> {activeTenantObj.display_name}</strong> : ''}.
            {!isEditMode && <span className="ml-1 opacity-60">(Additional tenants can be configured after deployment.)</span>}
          </p>
        </div>

        {showAddTenant && (
          <div className="rounded-lg border bg-background px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">New tenant</span>
              <button type="button" onClick={() => setShowAddTenant(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
            </div>
            <div>
              <Label className="text-xs">Tenant</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  placeholder="e.g. acme"
                  value={newTenantSlug}
                  onChange={e => setNewTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                  className="h-8 text-sm font-mono w-1/2"
                />
                <div className="flex items-center gap-1 rounded-lg border bg-background px-2 py-1 text-xs font-mono shrink-0">
                  <span className="text-muted-foreground">https://{displayProjectId || '{project}'}-</span>
                  <span className="text-primary font-semibold">{newTenantSlug || 'tenant'}</span>
                  <span className="text-muted-foreground">.apiblaze.com</span>
                </div>
              </div>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input
                placeholder="e.g. Acme Corp"
                value={newTenantDisplay}
                onChange={e => setNewTenantDisplay(e.target.value)}
                className="mt-1 h-8 text-sm w-1/2"
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={!newTenantSlug.trim() || addingTenant}
              onClick={handleAddTenant}
            >
              {addingTenant ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Add
            </Button>
          </div>
        )}
      </div>

      {/* ── Request Authentication ── */}
      <div className="space-y-3">
        <div>
          <Label className="text-base font-semibold">API Requests Authentication</Label>
          <p className="text-sm text-muted-foreground">
            How each incoming API request is verified before reaching your target server.
          </p>
        </div>

        <RequestsAuthSection config={config} updateConfig={updateConfig} />
      </div>

      <Separator />

      {/* Login page / app clients section */}
      <div className="space-y-3">
        <div>
          <Label className="text-base font-semibold">Login Page</Label>
          <p className="text-sm text-muted-foreground">
            {isEditMode
              ? 'App clients and OAuth providers for the selected tenant.'
              : 'Set the login page to get oAuth access tokens AND to your API portal.'}
          </p>
        </div>

        {isEditMode && project && projectTeamId ? (() => {
          const tenantObj = attachedTenants.find(t => t.tenant_name === effectiveTenant);
          if (!tenantObj) return <p className="text-sm text-muted-foreground">Select a tenant above to manage its login page.</p>;
          return (
            <TenantDetail
              tenant={tenantObj}
              project={project}
              config={config}
              updateConfig={updateConfig}
              teamId={projectTeamId}
              onProjectUpdate={onProjectUpdate}
            />
          );
        })() : (
          <CreateModeLoginSetup config={config} updateConfig={updateConfig} />
        )}
      </div>

      {/* New tenant setup dialog (edit mode) */}
      {isEditMode && project && projectTeamId && (
        <NewTenantSetupDialog
          open={showNewTenantDialog}
          onOpenChange={setShowNewTenantDialog}
          teamId={projectTeamId}
          project={project}
          onSuccess={slug => refreshTenants(slug)}
          onEnableJwt={() => {
            const currentMethods = config.requestsAuthMethods ?? ['jwt'];
            updateConfig({
              requestsAuthMethods: currentMethods.includes('jwt') ? currentMethods : [...currentMethods, 'jwt'],
              allowApiblazeJwt: true,
              allowOtherJwt: true,
              enableSocialAuth: true,
            });
          }}
        />
      )}
    </div>
  );
}
