"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plug, CheckCircle, XCircle, Loader2, ExternalLink, Trash2 } from "lucide-react";
import { integrationsApi, ApiError } from "@/lib/api-client";
import { useWorkspace } from "@/contexts/workspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const INTEGRATION_DEFS = [
  {
    type: "SLACK",
    name: "Slack",
    description: "Connect Slack to let AI agents read channels and post summaries.",
    icon: "💬",
    connectKey: "slack" as const,
  },
  {
    type: "GMAIL",
    name: "Gmail",
    description: "Connect Gmail to auto-classify emails and generate AI draft replies.",
    icon: "📧",
    connectKey: "gmail" as const,
  },
];

export function IntegrationsPage() {
  const { getToken } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const queryClient = useQueryClient();

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ["integrations", activeWorkspace?.id],
    enabled: !!activeWorkspace,
    queryFn: async () => {
      const token = await getToken();
      return integrationsApi.list(token!);
    },
  });

  const handleConnect = async (type: "slack" | "gmail") => {
    const token = await getToken();
    const result = type === "slack"
      ? await integrationsApi.connectSlack(token!)
      : await integrationsApi.connectGmail(token!);
    window.location.href = result.authUrl;
  };

  const handleDisconnect = async (id: string) => {
    const token = await getToken();
    await integrationsApi.disconnect(token!, id);
    queryClient.invalidateQueries({ queryKey: ["integrations", activeWorkspace?.id] });
  };

  const connectedTypes = new Set((integrations as any[]).map((i: any) => i.type));

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Integrations</h1>
        <p className="text-slate-400 text-sm mt-1">
          Connect your tools to give AI agents real-time context and actions
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {INTEGRATION_DEFS.map((def) => {
            const connected = (integrations as any[]).find((i: any) => i.type === def.type);
            return (
              <Card key={def.type} className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{def.icon}</span>
                      <div>
                        <CardTitle className="text-white text-base">{def.name}</CardTitle>
                        <CardDescription className="text-slate-400 text-xs mt-0.5">
                          {def.description}
                        </CardDescription>
                      </div>
                    </div>
                    {connected ? (
                      <Badge variant="success" className="flex items-center gap-1 shrink-0">
                        <CheckCircle className="w-3 h-3" />
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="shrink-0">Not connected</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {connected ? (
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-500">
                        Connected {new Date(connected.createdAt).toLocaleDateString()}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-slate-500 hover:text-red-400"
                        onClick={() => handleDisconnect(connected.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-1.5" />
                        Disconnect
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-slate-700 text-slate-300 hover:text-white"
                      onClick={() => handleConnect(def.connectKey)}
                    >
                      <ExternalLink className="w-3 h-3 mr-1.5" />
                      Connect {def.name}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
