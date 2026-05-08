"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Zap, Plus, Play, Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
import { workflowsApi } from "@/lib/api-client";
import { useWorkspace } from "@/contexts/workspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TRIGGER_LABELS: Record<string, string> = {
  MANUAL: "Manual",
  SCHEDULE: "Schedule",
  WEBHOOK: "Webhook",
  SLACK_MESSAGE: "Slack Message",
  EMAIL_RECEIVED: "Email Received",
};

export function WorkflowsPage() {
  const { getToken } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const queryClient = useQueryClient();

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ["workflows", activeWorkspace?.id],
    enabled: !!activeWorkspace,
    queryFn: async () => {
      const token = await getToken();
      return workflowsApi.list(token!);
    },
  });

  const handleTrigger = async (workflowId: string) => {
    const token = await getToken();
    await workflowsApi.trigger(token!, workflowId);
    queryClient.invalidateQueries({ queryKey: ["workflows", activeWorkspace?.id] });
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Workflows</h1>
          <p className="text-slate-400 text-sm mt-1">
            Automate tasks with AI agents triggered by schedules, webhooks, or events
          </p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          New Workflow
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      ) : (workflows as any[]).length > 0 ? (
        <div className="space-y-3">
          {(workflows as any[]).map((wf) => (
            <Card key={wf.id} className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg", wf.isActive ? "bg-green-600/10" : "bg-slate-800")}>
                      <Zap className={cn("w-4 h-4", wf.isActive ? "text-green-400" : "text-slate-500")} />
                    </div>
                    <div>
                      <CardTitle className="text-white text-base">{wf.name}</CardTitle>
                      {wf.description && (
                        <CardDescription className="text-slate-400 text-xs">{wf.description}</CardDescription>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-slate-700 text-slate-400 text-xs">
                      {TRIGGER_LABELS[wf.trigger] ?? wf.trigger}
                    </Badge>
                    <Badge variant={wf.isActive ? "success" : "secondary"} className="text-xs">
                      {wf.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    {wf.agent && <span>Agent: {wf.agent.name}</span>}
                    <span>{wf._count?.executions ?? 0} runs</span>
                    <span>Updated {new Date(wf.updatedAt).toLocaleDateString()}</span>
                  </div>
                  {wf.trigger === "MANUAL" && wf.isActive && (
                    <Button size="sm" variant="outline" className="border-slate-700 text-slate-300 hover:text-white" onClick={() => handleTrigger(wf.id)}>
                      <Play className="w-3 h-3 mr-1.5" />
                      Run
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-slate-900 border-slate-800 p-12 text-center">
          <Zap className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-white font-medium mb-2">No workflows yet</h3>
          <p className="text-slate-400 text-sm mb-6">
            Create automated workflows triggered by schedules, webhooks, or events
          </p>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Create Workflow
          </Button>
        </Card>
      )}
    </div>
  );
}
