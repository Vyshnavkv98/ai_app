"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Shield, Users, ScrollText, Loader2,
  ChevronLeft, ChevronRight, Crown, UserCog,
} from "lucide-react";
import { adminApi } from "@/lib/api-client";
import { useWorkspace } from "@/contexts/workspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ROLES = ["VIEWER", "MEMBER", "ADMIN", "OWNER"] as const;
type Role = (typeof ROLES)[number];

const ROLE_COLORS: Record<Role, string> = {
  OWNER: "text-yellow-400 border-yellow-600/30 bg-yellow-600/10",
  ADMIN: "text-blue-400 border-blue-600/30 bg-blue-600/10",
  MEMBER: "text-slate-300 border-slate-600/30 bg-slate-600/10",
  VIEWER: "text-slate-500 border-slate-700/30 bg-slate-700/10",
};

const ACTION_COLORS: Record<string, string> = {
  "agent.created": "text-green-400",
  "agent.deleted": "text-red-400",
  "agent.updated": "text-blue-400",
  "workspace.created": "text-green-400",
  "workspace.updated": "text-blue-400",
  "workspace.deleted": "text-red-400",
  "integration.connected": "text-green-400",
  "integration.disconnected": "text-red-400",
  "file.uploaded": "text-blue-400",
  "file.deleted": "text-red-400",
  "member.role_updated": "text-yellow-400",
  "member.removed": "text-red-400",
  "workflow.created": "text-green-400",
  "workflow.updated": "text-blue-400",
};

export function AdminPanel() {
  const { getToken } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"users" | "audit">("users");
  const [auditPage, setAuditPage] = useState(1);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);

  const isOwner = activeWorkspace?.role === "OWNER";

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["admin-users", activeWorkspace?.id],
    enabled: !!activeWorkspace,
    queryFn: async () => {
      const token = await getToken();
      return adminApi.listUsers(token!);
    },
  });

  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ["audit-logs", activeWorkspace?.id, auditPage],
    enabled: !!activeWorkspace && activeTab === "audit",
    queryFn: async () => {
      const token = await getToken();
      return adminApi.auditLogs(token!, { page: auditPage, limit: 20 });
    },
  });

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingRole(userId);
    try {
      const token = await getToken();
      await adminApi.updateRole(token!, userId, newRole);
      queryClient.invalidateQueries({ queryKey: ["admin-users", activeWorkspace?.id] });
    } finally {
      setUpdatingRole(null);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-blue-600/10">
          <Shield className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
          <p className="text-slate-400 text-sm mt-0.5">Manage users and review audit logs</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-900 p-1 rounded-lg w-fit border border-slate-800">
        {[
          { id: "users", label: "Users", icon: Users },
          { id: "audit", label: "Audit Logs", icon: ScrollText },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-colors",
                activeTab === tab.id
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-white"
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Users tab */}
      {activeTab === "users" && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white text-base">
              Workspace Members ({(users as any[]).length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {usersLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
              </div>
            ) : (
              <div className="space-y-3">
                {(users as any[]).map((member: any) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between py-3 border-b border-slate-800 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm font-medium text-white">
                        {member.user?.name?.[0] ?? member.user?.email?.[0] ?? "?"}
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">
                          {member.user?.name ?? member.user?.email}
                        </p>
                        <p className="text-slate-500 text-xs">{member.user?.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className={cn("text-xs", ROLE_COLORS[member.role as Role])}
                      >
                        {member.role === "OWNER" && <Crown className="w-3 h-3 mr-1" />}
                        {member.role}
                      </Badge>

                      {isOwner && member.role !== "OWNER" && (
                        <div className="flex items-center gap-1">
                          {updatingRole === member.user?.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                          ) : (
                            <select
                              value={member.role}
                              onChange={(e) => handleRoleChange(member.user?.id, e.target.value)}
                              className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                            >
                              {ROLES.filter((r) => r !== "OWNER").map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Audit logs tab */}
      {activeTab === "audit" && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white text-base">
              Audit Trail
              {(auditData as any)?.total !== undefined && (
                <span className="text-slate-400 font-normal ml-2 text-sm">
                  ({(auditData as any).total} entries)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {auditLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {((auditData as any)?.data ?? []).map((log: any) => (
                    <div
                      key={log.id}
                      className="flex items-start justify-between py-2.5 border-b border-slate-800 last:border-0 gap-4"
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-600 mt-2 shrink-0" />
                        <div className="min-w-0">
                          <span
                            className={cn(
                              "text-sm font-mono font-medium",
                              ACTION_COLORS[log.action] ?? "text-slate-300"
                            )}
                          >
                            {log.action}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-slate-500">
                              by {log.user?.name ?? log.user?.email ?? "unknown"}
                            </span>
                            {log.ipAddress && (
                              <span className="text-xs text-slate-600">· {log.ipAddress}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs text-slate-500 shrink-0">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {(auditData as any)?.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-800">
                    <span className="text-xs text-slate-500">
                      Page {(auditData as any).page} of {(auditData as any).totalPages}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-slate-700 text-slate-400"
                        disabled={auditPage <= 1}
                        onClick={() => setAuditPage((p) => p - 1)}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-slate-700 text-slate-400"
                        disabled={auditPage >= (auditData as any).totalPages}
                        onClick={() => setAuditPage((p) => p + 1)}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
