"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { Send, Loader2, Bot, User, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { chatApi, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: string | Date;
}

interface StreamingMessage {
  role: "assistant";
  content: string;
  isStreaming: boolean;
}

export function ChatWindow({ sessionId }: { sessionId: string }) {
  const { getToken } = useAuth();
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMsg, setStreamingMsg] = useState<StreamingMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: messages = [], refetch } = useQuery<Message[]>({
    queryKey: ["messages", sessionId],
    queryFn: async () => {
      const token = await getToken();
      return chatApi.getMessages(token!, sessionId) as Promise<Message[]>;
    },
  });

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMsg?.content]);

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || isStreaming) return;

    setInput("");
    setError(null);
    setIsStreaming(true);
    setStreamingMsg({ role: "assistant", content: "", isStreaming: true });

    abortRef.current = new AbortController();

    try {
      const token = await getToken();
      const stream = await chatApi.sendMessage(
        token!,
        sessionId,
        { content },
        abortRef.current.signal
      );

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data || data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.token) {
              accumulated += parsed.token;
              setStreamingMsg({ role: "assistant", content: accumulated, isStreaming: true });
            }
            if (parsed.error) {
              setError(parsed.error);
            }
          } catch {
            // ignore malformed chunks
          }
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if ((err as Error).name !== "AbortError") {
        setError("Connection failed. Please try again.");
      }
    } finally {
      setIsStreaming(false);
      setStreamingMsg(null);
      await refetch();
    }
  }, [input, isStreaming, sessionId, getToken, refetch]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
    }
  };

  const allMessages: (Message | StreamingMessage)[] = streamingMsg
    ? [...messages, streamingMsg]
    : messages;

  return (
    <div className="flex flex-col h-screen bg-slate-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800 bg-slate-900">
        <Link href="/chat">
          <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="p-1.5 rounded-lg bg-blue-600/10">
          <Bot className="w-4 h-4 text-blue-400" />
        </div>
        <div>
          <h2 className="text-white font-medium text-sm">AI Assistant</h2>
          <p className="text-xs text-slate-500">Nexus AI</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {allMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="p-4 rounded-2xl bg-blue-600/10 mb-4">
              <Bot className="w-8 h-8 text-blue-400" />
            </div>
            <h3 className="text-white font-medium mb-2">How can I help you?</h3>
            <p className="text-slate-400 text-sm max-w-sm">
              Ask me anything — I can answer questions, summarize documents, and help automate your workflows.
            </p>
          </div>
        )}

        {allMessages.map((msg, i) => {
          const isUser = msg.role === "user";
          const isStreamingMsg = "isStreaming" in msg;

          return (
            <div
              key={isStreamingMsg ? "streaming" : (msg as Message).id ?? i}
              className={cn("flex gap-3 max-w-3xl mx-auto w-full", isUser && "flex-row-reverse")}
            >
              {/* Avatar */}
              <div
                className={cn(
                  "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                  isUser ? "bg-blue-600" : "bg-slate-700"
                )}
              >
                {isUser ? (
                  <User className="w-4 h-4 text-white" />
                ) : (
                  <Bot className="w-4 h-4 text-slate-300" />
                )}
              </div>

              {/* Bubble */}
              <div
                className={cn(
                  "rounded-2xl px-4 py-3 max-w-[80%] text-sm leading-relaxed",
                  isUser
                    ? "bg-blue-600 text-white rounded-tr-sm"
                    : "bg-slate-800 text-slate-100 rounded-tl-sm"
                )}
              >
                {msg.content || (
                  <span className="flex gap-1 items-center text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {error && (
          <div className="max-w-3xl mx-auto w-full">
            <div className="bg-red-900/30 border border-red-800 text-red-300 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-6 pt-3 border-t border-slate-800 bg-slate-900">
        <div className="max-w-3xl mx-auto flex gap-3 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Message Nexus AI… (Enter to send, Shift+Enter for newline)"
              rows={1}
              disabled={isStreaming}
              className="w-full resize-none rounded-xl bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 px-4 py-3 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50 transition-colors"
              style={{ minHeight: "48px", maxHeight: "160px" }}
            />
          </div>
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            size="icon"
            className="h-12 w-12 rounded-xl shrink-0"
          >
            {isStreaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-center text-xs text-slate-600 mt-2">
          Nexus AI can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}
