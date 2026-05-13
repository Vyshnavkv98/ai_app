import { prisma } from "../lib/prisma";

export class AnalyticsService {
  async getUsage(
    workspaceId: string,
    params: { from?: string; to?: string; groupBy?: "user" | "agent" | "model" }
  ) {
    const from = params.from ? new Date(params.from) : new Date(new Date().setDate(1)); // start of month
    const to = params.to ? new Date(params.to) : new Date();

    const where = { workspaceId, createdAt: { gte: from, lte: to } };

    // Aggregate totals
    const totals = await prisma.usageLog.aggregate({
      where,
      _sum: { totalTokens: true, costUsd: true, promptTokens: true, completionTokens: true },
      _count: { id: true },
    });

    // Daily time series
    const dailyLogs = await prisma.usageLog.findMany({
      where,
      select: { createdAt: true, totalTokens: true, costUsd: true },
      orderBy: { createdAt: "asc" },
    });

    // Group by day
    const seriesMap = new Map<string, { tokens: number; costUsd: number; requests: number }>();
    for (const log of dailyLogs) {
      const day = log.createdAt.toISOString().split("T")[0];
      const existing = seriesMap.get(day) ?? { tokens: 0, costUsd: 0, requests: 0 };
      seriesMap.set(day, {
        tokens: existing.tokens + (log.totalTokens ?? 0),
        costUsd: existing.costUsd + (log.costUsd ?? 0),
        requests: existing.requests + 1,
      });
    }

    const series = Array.from(seriesMap.entries()).map(([date, data]) => ({ date, ...data }));

    // Optional groupBy breakdown
    let breakdown: unknown[] = [];
    if (params.groupBy === "user") {
      const grouped = await prisma.usageLog.groupBy({
        by: ["userId"],
        where,
        _sum: { totalTokens: true, costUsd: true },
        _count: { id: true },
        orderBy: { _sum: { costUsd: "desc" } },
        take: 20,
      });
      const userIds = grouped.map((g) => g.userId).filter(Boolean) as string[];
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, name: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));
      breakdown = grouped.map((g) => ({
        userId: g.userId,
        user: g.userId ? userMap.get(g.userId) : null,
        totalTokens: g._sum.totalTokens ?? 0,
        totalCostUsd: g._sum.costUsd ?? 0,
        requestCount: g._count.id,
      }));
    } else if (params.groupBy === "model") {
      const grouped = await prisma.usageLog.groupBy({
        by: ["model"],
        where,
        _sum: { totalTokens: true, costUsd: true },
        _count: { id: true },
        orderBy: { _sum: { costUsd: "desc" } },
      });
      breakdown = grouped.map((g) => ({
        model: g.model,
        totalTokens: g._sum.totalTokens ?? 0,
        totalCostUsd: g._sum.costUsd ?? 0,
        requestCount: g._count.id,
      }));
    }

    return {
      totalTokens: totals._sum.totalTokens ?? 0,
      totalCostUsd: totals._sum.costUsd ?? 0,
      requestCount: totals._count.id,
      promptTokens: totals._sum.promptTokens ?? 0,
      completionTokens: totals._sum.completionTokens ?? 0,
      series,
      breakdown,
      period: { from: from.toISOString(), to: to.toISOString() },
    };
  }

  async getAgentAnalytics(workspaceId: string) {
    const from = new Date(new Date().setDate(1)); // start of month

    const grouped = await prisma.usageLog.groupBy({
      by: ["agentId"],
      where: { workspaceId, agentId: { not: null }, createdAt: { gte: from } },
      _sum: { totalTokens: true, costUsd: true },
      _count: { id: true },
      orderBy: { _sum: { costUsd: "desc" } },
      take: 20,
    });

    const agentIds = grouped.map((g) => g.agentId).filter(Boolean) as string[];
    const agents = await prisma.agent.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true, model: true },
    });
    const agentMap = new Map(agents.map((a) => [a.id, a]));

    return grouped.map((g) => ({
      agentId: g.agentId,
      agent: g.agentId ? agentMap.get(g.agentId) : null,
      totalTokens: g._sum.totalTokens ?? 0,
      totalCostUsd: g._sum.costUsd ?? 0,
      requestCount: g._count.id,
    }));
  }
}

export const analyticsService = new AnalyticsService();
