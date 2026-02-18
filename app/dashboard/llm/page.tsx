'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Bot,
  KeyRound,
  ListTree,
  MessageCircle,
  Network,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { listProjects } from '@/lib/api/projects';
import type { Project } from '@/types/project';
import { fetchOpenApiSpec } from '@/lib/api/openapi';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

type RouteSelection = {
  path: string;
  method: string;
  description: string;
  include: boolean;
};

type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

type OperationEntry = {
  id: string;
  path: string;
  method: string;
  summary?: string;
  description?: string;
};

type ApiKeyState = {
  openai?: string;
  anthropic?: string;
  deepseek?: string;
};

type OpenAPISpec = {
  info?: {
    title?: string;
    description?: string;
  };
  servers?: Array<{ url: string }>;
  paths?: Record<
    string,
    Record<
      string,
      {
        operationId?: string;
        summary?: string;
        description?: string;
        parameters?: Array<{
          name: string;
          in: 'query' | 'path' | 'header' | 'cookie';
          description?: string;
          required?: boolean;
        }>;
        requestBody?: {
          description?: string;
          required?: boolean;
        };
        responses?: Record<
          string,
          {
            description?: string;
          }
        >;
      }
    >
  >;
};

function sanitizeToolName(method: string, path: string, operationId?: string) {
  if (operationId) {
    return operationId.replace(/[^a-zA-Z0-9_]/g, '_');
  }
  const cleaned = `${method}_${path}`.replace(/[{}\/]/g, '_');
  return cleaned.replace(/_+/g, '_');
}

function buildMcpSpec(
  spec: OpenAPISpec,
  selections: RouteSelection[],
  baseUrl: string,
  version: string
) {
  const tools = selections
    .filter((selection) => selection.include)
    .map((selection) => {
      const pathEntry = spec.paths?.[selection.path]?.[selection.method];
      const toolName = sanitizeToolName(
        selection.method,
        selection.path,
        pathEntry?.operationId
      );

      return {
        name: toolName,
        description:
          selection.description ||
          pathEntry?.summary ||
          pathEntry?.description ||
          `${selection.method.toUpperCase()} ${selection.path}`,
        input_schema: {
          type: 'object',
          description:
            'Parameters to send when invoking this API tool. Automatically constructed from path/query parameters.',
          properties: (pathEntry?.parameters ?? []).reduce<
            Record<string, unknown>
          >((acc, parameter) => {
            acc[parameter.name] = {
              type: 'string',
              description: parameter.description ?? `Value for ${parameter.name}.`,
            };
            return acc;
          }, {}),
        },
        output_schema: {
          type: 'object',
          description:
            pathEntry?.responses?.['200']?.description ??
            'JSON payload returned by the proxied API.',
        },
        'x-route': {
          method: selection.method.toUpperCase(),
          path: selection.path,
          url: baseUrl,
          operationId: pathEntry?.operationId,
        },
      };
    });

  return {
    version,
    generated_at: new Date().toISOString(),
    tools,
  };
}

export default function EnableLlmPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>('prod');
  const [apiKeys, setApiKeys] = useState<ApiKeyState>({});
  const [isFetchingSpec, setIsFetchingSpec] = useState(false);
  const [openapiSpec, setOpenapiSpec] = useState<OpenAPISpec | null>(null);
  const [routeSelections, setRouteSelections] = useState<Record<string, RouteSelection>>({});
  const [activePreviewTab, setActivePreviewTab] = useState<'tree' | 'mcp'>('tree');
  const [generatedSpec, setGeneratedSpec] = useState<Record<string, unknown> | null>(null);
  const [specConversation, setSpecConversation] = useState<ConversationMessage[]>([]);
  const [runtimeConversation, setRuntimeConversation] = useState<ConversationMessage[]>([]);
  const [specPrompt, setSpecPrompt] = useState('');
  const [runtimePrompt, setRuntimePrompt] = useState('');

  useEffect(() => {
    let mounted = true;
    async function loadProjects() {
      setIsLoadingProjects(true);
      try {
        const result = await listProjects({ limit: 50, page: 1 });
        if (!mounted) return;
        setProjects(result.projects);
        if (result.projects.length > 0) {
          setSelectedProjectId(result.projects[0].project_id);
        }
      } catch (error) {
        console.error('Failed to load projects', error);
        toast({
          title: 'Failed to load projects',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        if (mounted) {
          setIsLoadingProjects(false);
        }
      }
    }

    void loadProjects();
    return () => {
      mounted = false;
    };
  }, [toast]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.project_id === selectedProjectId),
    [projects, selectedProjectId]
  );

  useEffect(() => {
    async function loadSpec() {
      if (!selectedProject) {
        setOpenapiSpec(null);
        setRouteSelections({});
        return;
      }

      setIsFetchingSpec(true);
      try {
        const spec = (await fetchOpenApiSpec({
          projectId: selectedProject.project_id,
          apiVersion: selectedProject.api_version,
          environment: selectedEnvironment,
        })) as OpenAPISpec;
        setOpenapiSpec(spec);

        const operations = Object.entries(spec.paths ?? {}).flatMap(
          ([path, methods]) =>
            Object.entries(methods).map(([method, operation]) => {
              const id = `${method.toLowerCase()} ${path}`;
              return {
                id,
                path,
                method: method.toLowerCase(),
                summary: operation.summary,
                description: operation.description,
              };
            })
        ) as OperationEntry[];

        const initialSelections = operations.slice(0, 3).reduce<
          Record<string, RouteSelection>
        >((acc, operation) => {
          acc[operation.id] = {
            path: operation.path,
            method: operation.method,
            description: operation.summary ?? operation.description ?? '',
            include: true,
          };
          return acc;
        }, {});

        setRouteSelections(initialSelections);
      } catch (error) {
        console.error('Failed to fetch OpenAPI spec', error);
        toast({
          title: 'Failed to fetch OpenAPI spec',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
        setOpenapiSpec(null);
        setRouteSelections({});
      } finally {
        setIsFetchingSpec(false);
      }
    }

    void loadSpec();
  }, [selectedProject, selectedEnvironment, toast]);

  const operations: OperationEntry[] = useMemo(() => {
    if (!openapiSpec?.paths) {
      return [];
    }

    return Object.entries(openapiSpec.paths).flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, operation]) => ({
        id: `${method.toLowerCase()} ${path}`,
        path,
        method: method.toLowerCase(),
        summary: operation.summary,
        description: operation.description,
      }))
    );
  }, [openapiSpec]);

  const baseApiUrl = useMemo(() => {
    if (selectedProject?.urls?.api) {
      return selectedProject.urls.api.replace(/\/+$/, '');
    }
    if (selectedProject) {
      return `https://${selectedProject.project_id}.apiblaze.com/${selectedProject.api_version}/${selectedEnvironment}`;
    }
    return '';
  }, [selectedProject, selectedEnvironment]);

  function updateRouteSelection(id: string, changes: Partial<RouteSelection>) {
    setRouteSelections((current) => ({
      ...current,
      [id]: {
        ...current[id],
        ...changes,
      },
    }));
  }

  function handleToggleRoute(id: string) {
    setRouteSelections((current) => {
      const existing = current[id];
      if (!existing) {
        const operation = operations.find((op) => op.id === id);
        if (!operation) return current;
        return {
          ...current,
          [id]: {
            path: operation.path,
            method: operation.method,
            description: operation.summary ?? operation.description ?? '',
            include: true,
          },
        };
      }
      return {
        ...current,
        [id]: {
          ...existing,
          include: !existing.include,
        },
      };
    });
  }

  function handleGenerateSpec() {
    if (!openapiSpec || !selectedProject) {
      toast({
        title: 'Select a project first',
        description: 'Choose a project with an OpenAPI spec before generating the MCP spec.',
      });
      return;
    }

    const selections = Object.values(routeSelections);
    if (selections.filter((selection) => selection.include).length === 0) {
      toast({
        title: 'Select at least one route',
        description: 'Enable at least one route to include in the MCP spec.',
        variant: 'destructive',
      });
      return;
    }

    const spec = buildMcpSpec(openapiSpec, selections, baseApiUrl, selectedProject.api_version);
    setGeneratedSpec(spec as unknown as Record<string, unknown>);
    setActivePreviewTab('mcp');
    toast({
      title: 'MCP spec preview updated',
      description: 'Review the generated MCP spec before saving.',
    });
  }

  function handleSaveProviderKey(provider: keyof ApiKeyState) {
    const value = apiKeys[provider];
    if (!value) {
      toast({
        title: 'Enter a key first',
        description: 'Provide a valid API key before saving.',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: `${provider.toUpperCase()} key saved`,
      description: 'Keys are stored securely server-side (placeholder implementation).',
    });
  }

  function appendConversationMessage(
    target: 'spec' | 'runtime',
    role: ConversationMessage['role'],
    content: string
  ) {
    const message: ConversationMessage = {
      role,
      content,
      timestamp: new Date().toISOString(),
    };

    if (target === 'spec') {
      setSpecConversation((current) => [...current, message]);
    } else {
      setRuntimeConversation((current) => [...current, message]);
    }
  }

  function handleSubmitPrompt(target: 'spec' | 'runtime') {
    const input = target === 'spec' ? specPrompt.trim() : runtimePrompt.trim();
    if (!input) {
      return;
    }

    appendConversationMessage(target, 'user', input);

    const response =
      target === 'spec'
        ? 'Spec assistant: Thanks! I will adjust the MCP spec once backend support is wired.'
        : 'Runtime assistant: Simulated execution. Connect to the MCP server to run commands.';

    appendConversationMessage(target, 'assistant', response);

    if (target === 'spec') {
      setSpecPrompt('');
    } else {
      setRuntimePrompt('');
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-gray-950 dark:via-gray-950 dark:to-gray-900">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" className="gap-2" onClick={() => router.push('/dashboard')}>
              <ArrowLeft className="h-4 w-4" />
              Back to dashboard
            </Button>
            <Badge variant="outline" className="gap-1 text-sm">
              <Bot className="h-3 w-3" />
              MCP Playground
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4" />
              Refresh data
            </Button>
            <Button className="gap-2" onClick={handleGenerateSpec} disabled={!openapiSpec}>
              <Sparkles className="h-4 w-4" />
              Generate MCP spec preview
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[2fr,1fr] gap-6">
          <div className="space-y-6">
            <Card>
              <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Network className="h-5 w-5 text-blue-600" />
                    Select API project
                  </CardTitle>
                  <CardDescription>
                    Choose the proxy project, API version, and deployment environment to hydrate the
                    MCP spec.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-muted-foreground">Project</span>
                    <select
                      className="h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={selectedProjectId}
                      onChange={(event) => setSelectedProjectId(event.target.value)}
                      disabled={isLoadingProjects}
                    >
                      {projects.map((project) => (
                        <option key={project.project_id} value={project.project_id}>
                          {project.display_name} ({project.project_id})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-muted-foreground">Environment</span>
                    <Input
                      value={selectedEnvironment}
                      onChange={(event) => setSelectedEnvironment(event.target.value)}
                      placeholder="prod"
                    />
                    <span className="text-xs text-muted-foreground">
                      Customize if you run multiple worker environments (e.g. staging).
                    </span>
                  </label>
                </div>

                <div className="rounded-md border border-dashed border-blue-200 bg-blue-50/40 p-4 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                  MCP specs auto-generate from the OpenAPI definition. Toggle routes to refine which
                  endpoints are exposed to LLM tools.
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-purple-600" />
                  Connect chat providers
                </CardTitle>
                <CardDescription>
                  Provide API keys to enable in-app chat with OpenAI, Anthropic, or DeepSeek models.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                {(['openai', 'anthropic', 'deepseek'] as Array<keyof ApiKeyState>).map((provider) => (
                  <div key={provider} className="flex flex-col gap-2 rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold uppercase">{provider}</span>
                      <Badge variant="secondary">Required for chat</Badge>
                    </div>
                    <Textarea
                      rows={3}
                      placeholder={`${provider.toUpperCase()} API key`}
                      value={apiKeys[provider] ?? ''}
                      onChange={(event) =>
                        setApiKeys((current) => ({
                          ...current,
                          [provider]: event.target.value,
                        }))
                      }
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleSaveProviderKey(provider)}
                    >
                      Save {provider}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="min-h-[400px]">
              <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ListTree className="h-5 w-5 text-emerald-600" />
                    Routes & MCP tools
                  </CardTitle>
                  <CardDescription>
                    Inspect your OpenAPI paths, toggle the ones you want available, and edit the tool
                    descriptions that will guide the LLM.
                  </CardDescription>
                </div>
                <Badge variant="outline">{operations.length} operations detected</Badge>
              </CardHeader>
              <CardContent>
                <Tabs value={activePreviewTab} onValueChange={(value) => setActivePreviewTab(value as typeof activePreviewTab)}>
                  <TabsList>
                    <TabsTrigger value="tree">Route tree</TabsTrigger>
                    <TabsTrigger value="mcp">MCP spec preview</TabsTrigger>
                  </TabsList>
                  <TabsContent value="tree">
                    <div className="mt-4 space-y-3 max-h-[420px] overflow-y-auto pr-2">
                      {isFetchingSpec && <p className="text-sm text-muted-foreground">Loading OpenAPI spec...</p>}
                      {!isFetchingSpec && operations.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          No operations found in this OpenAPI spec.
                        </p>
                      )}
                      {operations.map((operation) => {
                        const selection = routeSelections[operation.id];
                        const enabled = selection?.include ?? false;
                        return (
                          <div
                            key={operation.id}
                            className="rounded-lg border bg-card p-4 shadow-sm transition hover:border-primary"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm font-semibold">
                                  <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-bold uppercase text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                    {operation.method}
                                  </span>
                                  <span>{operation.path}</span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {operation.summary || operation.description || 'No description provided.'}
                                </p>
                              </div>
                              <label className="flex items-center gap-2 text-sm font-medium">
                                <input
                                  type="checkbox"
                                  checked={enabled}
                                  onChange={() => handleToggleRoute(operation.id)}
                                  className="h-4 w-4 rounded border border-input"
                                />
                                Include
                              </label>
                            </div>
                            {enabled && (
                              <div className="mt-3 space-y-2">
                                <label className="text-xs font-medium uppercase text-muted-foreground">
                                  Tool description
                                </label>
                                <Textarea
                                  rows={2}
                                  value={selection?.description ?? ''}
                                  onChange={(event) =>
                                    updateRouteSelection(operation.id, {
                                      description: event.target.value,
                                    })
                                  }
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </TabsContent>
                  <TabsContent value="mcp">
                    <div className="mt-4">
                      {generatedSpec ? (
                        <pre className="max-h-[460px] overflow-y-auto rounded-md bg-muted p-4 text-xs">
{JSON.stringify(generatedSpec, null, 2)}
                        </pre>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Generate the MCP spec to preview the tool definitions that will be sent to
                          the worker.
                        </p>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-fuchsia-600" />
                  Chat about the spec
                </CardTitle>
                <CardDescription>
                  Iterate on the MCP spec with your preferred LLM once keys are configured.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex h-[320px] flex-col gap-3">
                <div className="flex-1 space-y-2 overflow-y-auto rounded-md border p-3 text-sm">
                  {specConversation.length === 0 ? (
                    <p className="text-muted-foreground">
                      Ask questions or request changes to the generated MCP tools.
                    </p>
                  ) : (
                    specConversation.map((message, index) => (
                      <div key={`${message.timestamp}-${index}`} className="space-y-1">
                        <p className="text-xs uppercase text-muted-foreground">
                          {message.role} · {new Date(message.timestamp).toLocaleTimeString()}
                        </p>
                        <p>{message.content}</p>
                      </div>
                    ))
                  )}
                </div>
                <div className="space-y-2">
                  <Textarea
                    placeholder="Describe the changes you want to apply to the MCP spec..."
                    value={specPrompt}
                    onChange={(event) => setSpecPrompt(event.target.value)}
                    rows={3}
                  />
                  <Button onClick={() => handleSubmitPrompt('spec')} className="w-full">
                    Send to spec assistant
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-cyan-600" />
                  Chat with your API via MCP
                </CardTitle>
                <CardDescription>
                  Once the MCP worker is deployed, test authenticated tool invocations in this chat.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex h-[320px] flex-col gap-3">
                <div className="flex-1 space-y-2 overflow-y-auto rounded-md border p-3 text-sm">
                  {runtimeConversation.length === 0 ? (
                    <p className="text-muted-foreground">
                      The conversation history with your deployed MCP server will appear here.
                    </p>
                  ) : (
                    runtimeConversation.map((message, index) => (
                      <div key={`${message.timestamp}-${index}`} className="space-y-1">
                        <p className="text-xs uppercase text-muted-foreground">
                          {message.role} · {new Date(message.timestamp).toLocaleTimeString()}
                        </p>
                        <p>{message.content}</p>
                      </div>
                    ))
                  )}
                </div>
                <div className="space-y-2">
                  <Textarea
                    placeholder="Ask the MCP-wrapped API to perform an authenticated action..."
                    value={runtimePrompt}
                    onChange={(event) => setRuntimePrompt(event.target.value)}
                    rows={3}
                  />
                  <Button onClick={() => handleSubmitPrompt('runtime')} className="w-full">
                    Send to MCP runtime
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

