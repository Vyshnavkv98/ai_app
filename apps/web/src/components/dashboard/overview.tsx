"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { Bot, Plug, MessageSquare, Coins, TrendingUp, Zap, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { analyticsApi, agentsApi, integrationsApi, chatApi } from "@/lib/api-client";
import { useWorkspace } from "@/contexts/workspace";

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  href,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: React.ElementType;
  trend?: string;
  href?: string;
}) {
  return (
    <Card className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-400">{title}</CardTitle>
        <div className="p-2 rounded-lg bg-blue-600/10">
          <Icon className="w-4 h-4 text-blue-400" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-white">{value}</div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-slate-500">{description}</p>
          {trend && (
            <span className="text-xs text-green-400 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              {trend}
            </span>
          )}
        </div>
        {href && (
          <Link href={href} className="mt-3 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function SkeletonCard() {
  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <div className="h-4 w-24 bg-slate-800 rounded animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="h-8 w-16 bg-slate-800 rounded animate-pulse mb-2" />
        <div className="h-3 w-32 bg-slate-800 rounded animate-pulse" />
      </CardContent>
    </Card>
  );
}

export function DashboardOverview() {
  const { getToken } = useAuth();
  const { activeWorkspace } = useWorkspace();

  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ["analytics-usage", activeWorkspace?.id],
    enabled: !!activeWorkspace,
    queryFn: async () => {
      const token = await getToken();
      return analyticsApi.usage(token!, {
        from: new Date(new Date().setDate(1)).toISOString().split("T")[0],
      });
    },
  });

  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ["agents", activeWorkspace?.id],
    enabled: !!activeWorkspace,
    queryFn: async () => {
      const token = await getToken();
      return agentsApi.list(token!);
    },
  });

  const { data: integrations, isLoading: integrationsLoading } = useQuery({
    queryKey: ["integrations", activeWorkspace?.id],
    enabled: !!activeWorkspace,
    queryFn: async () => {
      const token = await getToken();
      return integrationsApi.list(token!);
    },
  });

  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ["chat-sessions", activeWorkspace?.id],
    enabled: !!activeWorkspace,
    queryFn: async () => {
      const token = await getToken();
      return chatApi.listSessions(token!);
    },
  });

  const isLoading = usageLoading || agentsLoading || integrationsLoading || sessionsLoading;

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {activeWorkspace ? `${activeWorkspace.name}` : "Dashboard"}
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Here's what's happening in your workspace
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeWorkspace && (
            <Badge variant="outline" className="border-slate-700 text-slate-400">
              {activeWorkspace.plan} plan
            </Badge>
          )}
          <Button asChild size="sm">
            <Link href="/agents">
              <Bot className="w-4 h-4 mr-2" />
              New Agent
            </Link>
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard
              title="Active Agents"
              value={agents?.length ?? 0}
              description="Deployed in this workspace"
              icon={Bot}
              href="/agents"
            />
            <StatCard
              title="Integrations"
              value={integrations?.length ?? 0}
              description="Connected tools"
              icon={Plug}
              href="/integrations"
            />
            <StatCard
              title="Chat Sessions"
              value={sessions?.length ?? 0}
              description="This month"
              icon={MessageSquare}
              href="/chat"
            />
            <StatCard
              title="AI Spend"
              value={`$${(usage?.totalCostUsd ?? 0).toFixed(2)}`}
              description={`${(usage?.totalTokens ?? 0).toLocaleString()} tokens used`}
              icon={Coins}
              href="/analytics"
            />
          </>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-900 border-slate-800 hover:border-blue-600/50 transition-colors group">
          <CardHeader>
            <div className="p-2 w-fit rounded-lg bg-blue-600/10 mb-2">
              <Bot className="w-5 h-5 text-blue-400" />
            </div>
            <CardTitle className="text-white text-base">Build an Agent</CardTitle>
            <CardDescription className="text-slate-400">
              Create a custom AI agent with your own prompts, tools, and knowledge base.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm" className="border-slate-700 text-slate-300 hover:text-white">
              <Link href="/agents">
                Get started <ArrowRight className="w-3 h-3 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 hover:border-blue-600/50 transition-colors">
          <CardHeader>
            <div className="p-2 w-fit rounded-lg bg-purple-600/10 mb-2">
              <Plug className="w-5 h-5 text-purple-400" />
            </div>
            <CardTitle className="text-white text-base">Connect a Tool</CardTitle>
            <CardDescription className="text-slate-400">
              Link Slack, Gmail, or your database to give agents real-time context.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm" className="border-slate-700 text-slate-300 hover:text-white">
              <Link href="/integrations">
                Connect <ArrowRight className="w-3 h-3 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 hover:border-blue-600/50 transition-colors">
          <CardHeader>
            <div className="p-2 w-fit rounded-lg bg-green-600/10 mb-2">
              <Zap className="w-5 h-5 text-green-400" />
            </div>
            <CardTitle className="text-white text-base">Automate a Workflow</CardTitle>
            <CardDescription className="text-slate-400">
              Set up triggers to run AI agents on a schedule, webhook, or event.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm" className="border-slate-700 text-slate-300 hover:text-white">
              <Link href="/workflows">
                Create <ArrowRight className="w-3 h-3 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
