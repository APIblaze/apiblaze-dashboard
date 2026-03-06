'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Globe, Plus, AlertCircle } from 'lucide-react';
import { ProjectConfig } from './types';

interface DomainsSectionProps {
  config: ProjectConfig;
}

export function DomainsSection({ config }: DomainsSectionProps) {
  return (
    <div className="space-y-6">
      <div>
        <Label className="text-base font-semibold">Custom Domains</Label>
        <p className="text-sm text-muted-foreground mb-4">
          Add custom domains for your API proxy (Vercel-style domain management)
        </p>
      </div>

      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5" />
              <div>
                <CardTitle className="text-sm">Coming Soon</CardTitle>
                <CardDescription className="text-xs mt-1">
                  Custom domain management with automatic SSL certificates via Cloudflare
                </CardDescription>
              </div>
            </div>
            <Badge variant="secondary" className="text-xs">UI Placeholder</Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Placeholder UI */}
      <div className="space-y-4 opacity-50 pointer-events-none">
        <Card>
          <CardHeader>
            <Globe className="h-4 w-4 text-purple-600 mb-2" />
            <CardTitle className="text-sm">API Proxy Domain</CardTitle>
            <CardDescription className="text-xs">
              Custom domain for {config.projectName}-api.apiblaze.com
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Input placeholder="api.yourdomain.com" disabled />
              <div className="text-xs text-muted-foreground space-y-1">
                <p>• CNAME: {config.projectName}-api.apiblaze.com</p>
                <p>• TXT verification required</p>
                <p>• Automatic SSL certificate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Globe className="h-4 w-4 text-green-600 mb-2" />
            <CardTitle className="text-sm">Auth Domain</CardTitle>
            <CardDescription className="text-xs">
              Custom domain for {config.projectName}-api.auth.apiblaze.com
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input placeholder="auth.yourdomain.com" disabled />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Globe className="h-4 w-4 text-orange-600 mb-2" />
            <CardTitle className="text-sm">Portal Domain</CardTitle>
            <CardDescription className="text-xs">
              Custom domain for {config.projectName}-api.portal.apiblaze.com
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input placeholder="portal.yourdomain.com" disabled />
          </CardContent>
        </Card>

        <Button variant="outline" className="w-full" disabled>
          <Plus className="h-4 w-4 mr-2" />
          Add Custom Domain
        </Button>
      </div>

      <p className="text-xs text-center text-muted-foreground">
        Full domain management with DNS verification and SSL certificates will be implemented in a future update
      </p>
    </div>
  );
}

