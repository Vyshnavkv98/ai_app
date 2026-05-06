"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Bot, Plus, Wrench, Loader2, Trash2, Play, MessageSquare } from "lucide-react";
import { agentsApi, chatApi, ApiError } from "@/lib/api-client";
import { useWorkspace } from "@/contexts/workspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const MODEL_LABELS: Record<string, string> = {
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o Mini",
  "claude-3-5-sonnet-20241022": "Claude 3.5",
  "gemini-1.5-pro": "Gemini 1.5",
};

export function AgentList() {
  const { getToken } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["agents", activeWorkspace?.id],
    enabled: !!activeWorkspace,
    queryFn: async () => {
      const token = await getToken();
      return agentsApi.list(token!);
    },
  });

  const handleCreate = async () => {
    const token = await getToken();
    const agent = await agentsApi.create(token!, {
      name: "New Agent",
      description: "",
      systemPrompt: "You are a helpful AI assistant.",
      model: "gpt-4o",
      tools: [],
      memoryEnabled: true,
      ragEnabled: false,
      maxTokens: 4096,
      temperature: 0.7,
      isPublic: false,
      isDraft: true,
    });
    router.push(`/agents/${agent.id}/build`);
  };

  const handleDelete = async (agentId: string) => {
    const token = await getToken();
    await agentsApi.delete(token!, agentId);
    queryClient.invalidateQueries({ queryKey: ["agents", activeWorkspace?.id] });
  };

  const handleChat = async (agentId: string) => {
    const token = await getToken();
    const session = await chatApi.createSession(token!, { agentId });
    router.push(`/chat/${session.id}`);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Agents</h1>
          <p className="text-slate-400 text-sm mt-1">
            Build and deploy AI agents for your workspace
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="w-4 h-4 mr-2" />
          New Agent
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      ) : (agents as any[]).length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(agents as any[]).map((agent) => (
            <Card key={agent.id} className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-600/10">
                      <Bot className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <CardTitle className="text-white text-base">{agent.name}</CardTitle>
                      {agent.description && (
                        <CardDescription className="text-slate-400 text-xs mt-0.5 line-clamp-1">
                          {agent.description}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                  {agent.isDraft && (
                    <Badge variant="warning" className="text-xs">Draft</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 mb-4">
                  <Badge variant="secondary" className="text-xs">
                    {MODEL_LABELS[agent.model] ?? agent.model}
                  </Badge>
                  {agent.memoryEnabled && (
                    <Badge variant="outline" className="text-xs border-slate-700 text-slate-400">Memory</Badge>
                  )}
                  {agent.ragEnabled && (
                    <Badge variant="outline" className="text-xs border-slate-700 text-slate-400">RAG</Badge>
                  )}
                  <Badge variant="outline" className="text-xs border-slate-700 text-slate-400">
                    {agent._count?.chatSessions ?? 0} chats
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 border-slate-700 text-slate-300 hover:text-white"
                    onClick={() => router.push(`/agents/${agent.id}/build`)}
                  >
                    <Wrench className="w-3 h-3 mr-1.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => handleChat(agent.id)}
                  >
                    <MessageSquare className="w-3 h-3 mr-1.5" />
                    Chat
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-slate-500 hover:text-red-400 px-2"
                    onClick={() => handleDelete(agent.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-slate-900 border-slate-800 p-12 text-center">
          <Bot className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-white font-medium mb-2">No agents yet</h3>
          <p className="text-slate-400 text-sm mb-6">
            Create your first AI agent with a custom prompt, model, and tools
          </p>
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Create Agent
          </Button>
        </Card>
      )}
    </div>
  );
}
