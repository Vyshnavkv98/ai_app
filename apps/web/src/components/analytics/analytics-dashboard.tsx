"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Coins, Hash, Activity, Bot, Loader2 } from "lucide-react";
import { analyticsApi } from "@/lib/api-client";
import { useWorkspace } from "@/contexts/workspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const DATE_RANGES = [
  { label: "This month", value: "month" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
];

function getDateRange(range: string): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (range === "7d") from.setDate(from.getDate() - 7);
  else if (range === "30d") from.setDate(from.getDate() - 30);
  else from.setDate(1); // start of month
  return { from: from.toISOString().split("T")[0], to: to.toISOString().split("T")[0] };
}

function StatCard({ title, value, sub, icon: Icon, color = "blue" }: {
  title: string; value: string; sub?: string; icon: React.ElementType; color?: string;
}) {
  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-400">{title}</CardTitle>
        <div className={`p-2 rounded-lg bg-${color}-600/10`}>
          <Icon className={`w-4 h-4 text-${color}-400`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-white">{value}</div>
        {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

const CHART_COLORS = { tokens: "#3b82f6", cost: "#8b5cf6", requests: "#10b981" };

export function AnalyticsDashboard() {
  const { getToken } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [range, setRange] = useState("month");

  const { from, to } = getDateRange(range);

  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ["analytics-usage", activeWorkspace?.id, range],
    enabled: !!activeWorkspace,
    queryFn: async () => {
      const token = await getToken();
      return analyticsApi.usage(token!, { from, to });
    },
  });

  const { data: agentStats, isLoading: agentsLoading } = useQuery({
    queryKey: ["analytics-agents", activeWorkspace?.id],
    enabled: !!activeWorkspace,
    queryFn: async () => {
      const token = await getToken();
      return analyticsApi.agents(token!);
    },
  });

  const isLoading = usageLoading || agentsLoading;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-slate-400 text-sm mt-1">Token usage and AI cost breakdown</p>
        </div>
        <div className="flex gap-2">
          {DATE_RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm transition-colors",
                range === r.value
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              title="Total Tokens"
              value={((usage as any)?.totalTokens ?? 0).toLocaleString()}
              sub={`${((usage as any)?.promptTokens ?? 0).toLocaleString()} prompt · ${((usage as any)?.completionTokens ?? 0).toLocaleString()} completion`}
              icon={Hash}
            />
            <StatCard
              title="Total Cost"
              value={`$${((usage as any)?.totalCostUsd ?? 0).toFixed(4)}`}
              sub="USD this period"
              icon={Coins}
              color="purple"
            />
            <StatCard
              title="Requests"
              value={((usage as any)?.requestCount ?? 0).toLocaleString()}
              sub="LLM invocations"
              icon={Activity}
              color="green"
            />
            <StatCard
              title="Active Agents"
              value={((agentStats as any[])?.length ?? 0).toString()}
              sub="with usage this month"
              icon={Bot}
              color="orange"
            />
          </div>

          {/* Token usage chart */}
          {(usage as any)?.series?.length > 0 && (
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white text-base">Token Usage Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={(usage as any).series}>
                    <defs>
                      <linearGradient id="tokenGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.tokens} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_COLORS.tokens} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }}
                      labelStyle={{ color: "#94a3b8" }}
                      itemStyle={{ color: "#e2e8f0" }}
                    />
                    <Area type="monotone" dataKey="tokens" stroke={CHART_COLORS.tokens} fill="url(#tokenGrad)" strokeWidth={2} name="Tokens" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Cost chart */}
          {(usage as any)?.series?.length > 0 && (
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white text-base">Cost Over Time (USD)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={(usage as any).series}>
                    <defs>
                      <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.cost} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_COLORS.cost} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v.toFixed(3)}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }}
                      labelStyle={{ color: "#94a3b8" }}
                      formatter={(v: number) => [`$${v.toFixed(4)}`, "Cost"]}
                    />
                    <Area type="monotone" dataKey="costUsd" stroke={CHART_COLORS.cost} fill="url(#costGrad)" strokeWidth={2} name="Cost (USD)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Per-agent breakdown */}
          {(agentStats as any[])?.length > 0 && (
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white text-base">Cost by Agent (this month)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={(agentStats as any[]).slice(0, 8)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="agent.name" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v.toFixed(3)}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }}
                      formatter={(v: number) => [`$${v.toFixed(4)}`, "Cost"]}
                    />
                    <Bar dataKey="totalCostUsd" fill={CHART_COLORS.cost} radius={[4, 4, 0, 0]} name="Cost (USD)" />
                  </BarChart>
                </ResponsiveContainer>

                {/* Table */}
                <div className="mt-4 space-y-2">
                  {(agentStats as any[]).map((a: any) => (
                    <div key={a.agentId} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                      <div className="flex items-center gap-2">
                        <Bot className="w-4 h-4 text-slate-500" />
                        <span className="text-sm text-white">{a.agent?.name ?? "Unknown"}</span>
                        <Badge variant="secondary" className="text-xs">{a.agent?.model}</Badge>
                      </div>
                      <div className="flex items-center gap-6 text-xs text-slate-400">
                        <span>{a.totalTokens.toLocaleString()} tokens</span>
                        <span>{a.requestCount} requests</span>
                        <span className="text-white font-medium">${a.totalCostUsd.toFixed(4)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {!(usage as any)?.series?.length && !(agentStats as any[])?.length && (
            <Card className="bg-slate-900 border-slate-800 p-12 text-center">
              <Activity className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-white font-medium mb-2">No usage data yet</h3>
              <p className="text-slate-400 text-sm">Start chatting with agents to see analytics here.</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
