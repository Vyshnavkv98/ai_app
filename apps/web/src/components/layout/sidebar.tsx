"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Plug,
  BarChart3,
  Settings,
  Shield,
  Zap,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/contexts/workspace";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/workflows", label: "Workflows", icon: Zap },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/admin", label: "Admin", icon: Shield, adminOnly: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const { activeWorkspace, workspaces, setActiveWorkspace, isLoading } = useWorkspace();

  const isAdmin =
    activeWorkspace?.role === "OWNER" || activeWorkspace?.role === "ADMIN";

  return (
    <aside className="flex flex-col w-60 min-h-screen bg-slate-900 border-r border-slate-800">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-800">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 shrink-0">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <span className="font-bold text-white text-lg tracking-tight">Nexus AI</span>
      </div>

      {/* Workspace switcher */}
      <div className="px-3 py-3 border-b border-slate-800">
        {isLoading ? (
          <div className="h-9 rounded-md bg-slate-800 animate-pulse" />
        ) : (
          <div className="relative group">
            <button className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 transition-colors text-left">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {activeWorkspace?.name ?? "No workspace"}
                </p>
                <p className="text-xs text-slate-400 capitalize">
                  {activeWorkspace?.plan?.toLowerCase() ?? ""} plan
                </p>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
            </button>

            {/* Dropdown */}
            {workspaces.length > 1 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-md shadow-lg z-50 hidden group-focus-within:block">
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => setActiveWorkspace(ws)}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm hover:bg-slate-700 transition-colors first:rounded-t-md last:rounded-b-md",
                      ws.id === activeWorkspace?.id
                        ? "text-blue-400 font-medium"
                        : "text-slate-300"
                    )}
                  >
                    {ws.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          if (item.adminOnly && !isAdmin) return null;
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-600/20 text-blue-400 border border-blue-600/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-slate-800 flex items-center gap-3">
        <UserButton
          appearance={{
            elements: {
              avatarBox: "w-8 h-8",
            },
          }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white truncate">Account</p>
          {activeWorkspace && (
            <Badge variant="outline" className="text-xs border-slate-600 text-slate-400 mt-0.5">
              {activeWorkspace.role}
            </Badge>
          )}
        </div>
      </div>
    </aside>
  );
}
