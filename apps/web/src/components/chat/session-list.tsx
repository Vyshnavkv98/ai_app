"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { MessageSquare, Plus, Loader2 } from "lucide-react";
import { chatApi } from "@/lib/api-client";
import { useWorkspace } from "@/contexts/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ChatSessionList() {
  const { getToken } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const router = useRouter();

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["chat-sessions", activeWorkspace?.id],
    enabled: !!activeWorkspace,
    queryFn: async () => {
      const token = await getToken();
      return chatApi.listSessions(token!);
    },
  });

  const handleNewChat = async () => {
    const token = await getToken();
    const session = await chatApi.createSession(token!, {});
    router.push(`/chat/${session.id}`);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Chat Sessions</h1>
          <p className="text-slate-400 text-sm mt-1">
            Start a conversation with your AI agents
          </p>
        </div>
        <Button onClick={handleNewChat}>
          <Plus className="w-4 h-4 mr-2" />
          New Chat
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      ) : sessions && sessions.length > 0 ? (
        <div className="space-y-3">
          {sessions.map((session: any) => (
            <Card
              key={session.id}
              className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors cursor-pointer p-4"
              onClick={() => router.push(`/chat/${session.id}`)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="p-2 rounded-lg bg-blue-600/10 shrink-0">
                    <MessageSquare className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-white font-medium truncate">
                      {session.title || "Untitled conversation"}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(session.updatedAt).toLocaleDateString()} •{" "}
                      {session._count?.messages ?? 0} messages
                    </p>
                  </div>
                </div>
                {session.agent && (
                  <Badge variant="outline" className="border-slate-700 text-slate-400 shrink-0">
                    {session.agent.name}
                  </Badge>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-slate-900 border-slate-800 p-12 text-center">
          <MessageSquare className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-white font-medium mb-2">No chat sessions yet</h3>
          <p className="text-slate-400 text-sm mb-6">
            Start your first conversation with an AI agent
          </p>
          <Button onClick={handleNewChat}>
            <Plus className="w-4 h-4 mr-2" />
            New Chat
          </Button>
        </Card>
      )}
    </div>
  );
}
