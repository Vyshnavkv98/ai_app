import { Queue, Worker, Job } from "bullmq";
import { redis } from "./redis";
import { logger } from "./logger";

// ── Queue definitions ────────────────────────────────────────────────────────

export interface IndexingJobData {
  fileId: string;
  s3Key: string;
  workspaceId: string;
}

const connection = {
  host: new URL(process.env.REDIS_URL ?? "redis://localhost:6379").hostname,
  port: parseInt(
    new URL(process.env.REDIS_URL ?? "redis://localhost:6379").port || "6379"
  ),
};

export const indexingQueue = new Queue<IndexingJobData>("file-indexing", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

// ── Worker — calls FastAPI to do the actual indexing ─────────────────────────

export function startIndexingWorker(): Worker<IndexingJobData> {
  const worker = new Worker<IndexingJobData>(
    "file-indexing",
    async (job: Job<IndexingJobData>) => {
      const { fileId, s3Key, workspaceId } = job.data;
      logger.info("Processing indexing job", { fileId, s3Key, workspaceId });

      const AI_SERVICE_URL =
        process.env.AI_SERVICE_URL ?? "http://localhost:8000";

      const res = await fetch(`${AI_SERVICE_URL}/ai/rag/index`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId, s3_key: s3Key, workspace_id: workspaceId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(`AI service indexing failed: ${err.detail ?? res.statusText}`);
      }

      const result = await res.json();
      logger.info("Indexing job completed", { fileId, chunkCount: result.chunk_count });
      return result;
    },
    { connection, concurrency: 3 }
  );

  worker.on("completed", (job) => {
    logger.info("Indexing job completed", { jobId: job.id, fileId: job.data.fileId });
  });

  worker.on("failed", (job, err) => {
    logger.error("Indexing job failed", {
      jobId: job?.id,
      fileId: job?.data.fileId,
      error: err.message,
    });
  });

  return worker;
}
