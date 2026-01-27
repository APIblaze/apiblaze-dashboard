'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserCog, Plus } from 'lucide-react';

interface GroupsListProps {
  authConfigId: string;
  onRefresh?: () => void;
}

export function GroupsList({ authConfigId, onRefresh }: GroupsListProps) {
  // TODO: Implement groups management when backend API is available
  // This is a placeholder component that shows the structure
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Groups</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Manage groups in this auth config
          </p>
        </div>
        <Button disabled>
          <Plus className="mr-2 h-4 w-4" />
          Add Group
        </Button>
      </div>

      {/* Placeholder */}
      <Card className="border-2 border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <UserCog className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Groups Management</h3>
          <p className="text-muted-foreground text-center mb-4">
            Group management functionality will be available once the backend API is implemented.
          </p>
          <p className="text-sm text-muted-foreground">
            Auth Config ID: <code className="font-mono">{authConfigId}</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}














