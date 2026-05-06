"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Save, Play, ArrowLeft, Bot, Brain, Database,
  Thermometer, Hash, Loader2, CheckCircle,
} from "lucide-react";
import { agentsApi, ApiError } from "@/lib/api-client";
import { useWorkspace } from "@/contexts/workspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const MODELS = [
  { value: "gpt-4o",                    label: "GPT-4o",         provider: "OpenAI" },
  { value: "gpt-4o-mini",               label: "GPT-4o Mini",    provider: "OpenAI" },
  { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5",    provider: "Anthropic" },
  { value: "gemini-1.5-pro",            label: "Gemini 1.5 Pro", provider: "Google" },
];

interface AgentForm {
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
  memoryEnabled: boolean;
  ragEnabled: boolean;
  maxTokens: number;
  temperature: number;
  isDraft: boolean;
}

export function AgentBuilder({ agentId }: { agentId: string }) {
  const { getToken } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<AgentForm>({
    name: "New Agent",
    description: "",
    systemPrompt: "You are a helpful AI assistant.",
    model: "gpt-4o",
    memoryEnabled: true,
    ragEnabled: false,
    maxTokens: 4096,
    temperature: 0.7,
    isDraft: true,
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [activeTab, setActiveTab] = useState<"prompt" | "model" | "memory" | "test">("prompt");

  const { data: agent, isLoading } = useQuery({
    queryKey: ["agent", agentId],
    queryFn: async () => {
      const token = await getToken();
      return agentsApi.get(token!, agentId);
    },
  });

  useEffect(() => {
    if (agent) {
      setForm({
        name: (agent as any).name,
        description: (agent as any).description ?? "",
        systemPrompt: (agent as any).systemPrompt,
        model: (agent as any).model,
        memoryEnabled: (agent as any).memoryEnabled,
        ragEnabled: (agent as any).ragEnabled,
        maxTokens: (agent as any).maxTokens,
        temperature: (agent as any).temperature,
        isDraft: (agent as any).isDraft,
      });
    }
  }, [agent]);

  const handleSave = async (deploy = false) => {
    setSaving(true);
    try {
      const token = await getToken();
      await agentsApi.update(token!, agentId, {
        ...form,
        isDraft: deploy ? false : form.isDraft,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      queryClient.invalidateQueries({ queryKey: ["agents", activeWorkspace?.id] });
      if (deploy) router.push("/agents");
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testMessage.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const token = await getToken();
      const result = await agentsApi.invoke(token!, agentId, { message: testMessage });
      setTestResult((result as any).response);
    } catch (err) {
      setTestResult(err instanceof ApiError ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  const tabs = [
    { id: "prompt", label: "System Prompt", icon: Bot },
    { id: "model", label: "Model & Params", icon: Brain },
    { id: "memory", label: "Memory & RAG", icon: Database },
    { id: "test", label: "Test Agent", icon: Play },
  ] as const;

  return (
    <div className="flex flex-col h-screen bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-slate-400" onClick={() => router.push("/agents")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="bg-transparent text-white font-semibold text-lg focus:outline-none border-b border-transparent focus:border-blue-500 transition-colors px-1"
          />
          {form.isDraft && <Badge variant="warning" className="text-xs">Draft</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="border-slate-700 text-slate-300" onClick={() => handleSave(false)} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Save className="w-4 h-4" />}
            <span className="ml-1.5">{saved ? "Saved" : "Save"}</span>
          </Button>
          <Button size="sm" onClick={() => handleSave(true)} disabled={saving}>
            <Play className="w-4 h-4 mr-1.5" />
            Deploy
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — tabs */}
        <div className="w-56 border-r border-slate-800 bg-slate-900 p-3 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left",
                  activeTab === tab.id
                    ? "bg-blue-600/20 text-blue-400 border border-blue-600/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Right panel — content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "prompt" && (
            <div className="max-w-2xl space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What does this agent do?"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  System Prompt
                  <span className="text-slate-500 font-normal ml-2">
                    Use {"{{variableName}}"} for dynamic variables
                  </span>
                </label>
                <textarea
                  value={form.systemPrompt}
                  onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
                  rows={16}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500 font-mono resize-none"
                  placeholder="You are a helpful AI assistant..."
                />
                <p className="text-xs text-slate-500 mt-1">{form.systemPrompt.length} / 10,000 characters</p>
              </div>
            </div>
          )}

          {activeTab === "model" && (
            <div className="max-w-2xl space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">Model</label>
                <div className="grid grid-cols-2 gap-3">
                  {MODELS.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => setForm((f) => ({ ...f, model: m.value }))}
                      className={cn(
                        "p-3 rounded-lg border text-left transition-colors",
                        form.model === m.value
                          ? "border-blue-500 bg-blue-600/10"
                          : "border-slate-700 bg-slate-800 hover:border-slate-600"
                      )}
                    >
                      <p className="text-white text-sm font-medium">{m.label}</p>
                      <p className="text-slate-400 text-xs mt-0.5">{m.provider}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  <Thermometer className="w-4 h-4 inline mr-1" />
                  Temperature: <span className="text-blue-400">{form.temperature}</span>
                </label>
                <input
                  type="range" min="0" max="2" step="0.1"
                  value={form.temperature}
                  onChange={(e) => setForm((f) => ({ ...f, temperature: parseFloat(e.target.value) }))}
                  className="w-full accent-blue-500"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>Precise (0)</span><span>Balanced (1)</span><span>Creative (2)</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  <Hash className="w-4 h-4 inline mr-1" />
                  Max Tokens: <span className="text-blue-400">{form.maxTokens.toLocaleString()}</span>
                </label>
                <input
                  type="range" min="256" max="16384" step="256"
                  value={form.maxTokens}
                  onChange={(e) => setForm((f) => ({ ...f, maxTokens: parseInt(e.target.value) }))}
                  className="w-full accent-blue-500"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>256</span><span>16,384</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === "memory" && (
            <div className="max-w-2xl space-y-4">
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-white text-sm">Short-term Memory</CardTitle>
                      <p className="text-slate-400 text-xs mt-1">
                        Remember the last 20 messages in a conversation (stored in Redis)
                      </p>
                    </div>
                    <button
                      onClick={() => setForm((f) => ({ ...f, memoryEnabled: !f.memoryEnabled }))}
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors",
                        form.memoryEnabled ? "bg-blue-600" : "bg-slate-700"
                      )}
                    >
                      <span className={cn(
                        "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                        form.memoryEnabled && "translate-x-5"
                      )} />
                    </button>
                  </div>
                </CardHeader>
              </Card>

              <Card className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-white text-sm">RAG — Knowledge Base</CardTitle>
                      <p className="text-slate-400 text-xs mt-1">
                        Search uploaded documents and inject relevant context into every response
                      </p>
                    </div>
                    <button
                      onClick={() => setForm((f) => ({ ...f, ragEnabled: !f.ragEnabled }))}
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors",
                        form.ragEnabled ? "bg-blue-600" : "bg-slate-700"
                      )}
                    >
                      <span className={cn(
                        "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                        form.ragEnabled && "translate-x-5"
                      )} />
                    </button>
                  </div>
                </CardHeader>
                {form.ragEnabled && (
                  <CardContent>
                    <p className="text-xs text-blue-400">
                      ✓ Agent will search your Knowledge Base on every message.
                      Upload documents at <a href="/files" className="underline">Knowledge Base</a>.
                    </p>
                  </CardContent>
                )}
              </Card>
            </div>
          )}

          {activeTab === "test" && (
            <div className="max-w-2xl space-y-4">
              <p className="text-slate-400 text-sm">
                Test your agent with a sample message before deploying.
              </p>
              <div className="flex gap-2">
                <input
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleTest()}
                  placeholder="Enter a test message…"
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
                <Button onClick={handleTest} disabled={!testMessage.trim() || testing}>
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                </Button>
              </div>
              {testResult && (
                <Card className="bg-slate-900 border-slate-800">
                  <CardContent className="pt-4">
                    <p className="text-xs text-slate-500 mb-2">Agent response:</p>
                    <p className="text-slate-200 text-sm whitespace-pre-wrap">{testResult}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
