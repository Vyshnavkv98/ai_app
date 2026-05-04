"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDropzone } from "react-dropzone";
import {
  Upload, FileText, Trash2, RefreshCw, Loader2,
  CheckCircle, XCircle, Clock, AlertCircle,
} from "lucide-react";
import { filesApi, ApiError } from "@/lib/api-client";
import { useWorkspace } from "@/contexts/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary"; icon: React.ElementType }> = {
    INDEXED:  { label: "Indexed",  variant: "success",     icon: CheckCircle },
    INDEXING: { label: "Indexing", variant: "warning",     icon: Loader2 },
    PENDING:  { label: "Pending",  variant: "secondary",   icon: Clock },
    FAILED:   { label: "Failed",   variant: "destructive", icon: XCircle },
  };
  const cfg = map[status] ?? { label: status, variant: "secondary", icon: AlertCircle };
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant as any} className="flex items-center gap-1">
      <Icon className={cn("w-3 h-3", status === "INDEXING" && "animate-spin")} />
      {cfg.label}
    </Badge>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileManager() {
  const { getToken } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: files = [], isLoading } = useQuery({
    queryKey: ["files", activeWorkspace?.id],
    enabled: !!activeWorkspace,
    refetchInterval: (data: any) =>
      (data as any[])?.some((f: any) => f.indexStatus === "INDEXING" || f.indexStatus === "PENDING")
        ? 3000
        : false,
    queryFn: async () => {
      const token = await getToken();
      return filesApi.list(token!);
    },
  });

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!acceptedFiles.length) return;
      setUploading(true);
      setUploadError(null);

      for (const file of acceptedFiles) {
        try {
          const token = await getToken();
          await filesApi.upload(token!, file);
        } catch (err) {
          setUploadError(err instanceof ApiError ? err.message : "Upload failed");
        }
      }

      setUploading(false);
      queryClient.invalidateQueries({ queryKey: ["files", activeWorkspace?.id] });
    },
    [getToken, activeWorkspace, queryClient]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/plain": [".txt"],
      "text/markdown": [".md"],
      "text/csv": [".csv"],
    },
    maxSize: 50 * 1024 * 1024,
    disabled: uploading,
  });

  const handleDelete = async (fileId: string) => {
    const token = await getToken();
    await filesApi.delete(token!, fileId);
    queryClient.invalidateQueries({ queryKey: ["files", activeWorkspace?.id] });
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Knowledge Base</h1>
        <p className="text-slate-400 text-sm mt-1">
          Upload documents to give your AI agents context from your files
        </p>
      </div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors",
          isDragActive
            ? "border-blue-500 bg-blue-500/10"
            : "border-slate-700 hover:border-slate-600 bg-slate-900/50"
        )}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            <p className="text-slate-300 text-sm">Uploading…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload className="w-8 h-8 text-slate-500" />
            <div>
              <p className="text-white font-medium">
                {isDragActive ? "Drop files here" : "Drag & drop files here"}
              </p>
              <p className="text-slate-400 text-sm mt-1">
                or click to browse — PDF, DOCX, TXT, MD, CSV up to 50 MB
              </p>
            </div>
          </div>
        )}
      </div>

      {uploadError && (
        <div className="bg-red-900/30 border border-red-800 text-red-300 rounded-lg px-4 py-3 text-sm">
          {uploadError}
        </div>
      )}

      {/* File list */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      ) : files.length > 0 ? (
        <div className="space-y-3">
          {files.map((file: any) => (
            <Card
              key={file.id}
              className="bg-slate-900 border-slate-800 p-4 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="p-2 rounded-lg bg-slate-800 shrink-0">
                  <FileText className="w-4 h-4 text-slate-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {formatBytes(file.sizeBytes)}
                    {file.chunkCount ? ` · ${file.chunkCount} chunks` : ""}
                    {" · "}
                    {new Date(file.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <StatusBadge status={file.indexStatus} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-slate-500 hover:text-red-400 h-8 w-8"
                  onClick={() => handleDelete(file.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-slate-900 border-slate-800 p-10 text-center">
          <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-white font-medium">No files yet</p>
          <p className="text-slate-400 text-sm mt-1">
            Upload your first document to build your knowledge base
          </p>
        </Card>
      )}
    </div>
  );
}
