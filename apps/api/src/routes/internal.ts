/**
 * Internal routes — only callable from within the same VPC/Docker network.
 * Used by the AI service to update file indexing status.
 * Protected by a shared internal secret header.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

const router = Router();

const UpdateFileStatusSchema = z.object({
  indexStatus: z.enum(["PENDING", "INDEXING", "INDEXED", "FAILED"]),
  chunkCount: z.coerce.number().int().positive().optional(),
});

router.patch("/files/:fileId/status", async (req: Request, res: Response) => {
  // Verify internal secret
  const secret = req.headers["x-internal-secret"];
  const expected = process.env.INTERNAL_SECRET ?? "dev-internal-secret";
  if (secret !== expected) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { fileId } = req.params;
  const body = UpdateFileStatusSchema.parse(req.body);

  await prisma.file.update({
    where: { id: fileId },
    data: {
      indexStatus: body.indexStatus,
      ...(body.chunkCount !== undefined && { chunkCount: body.chunkCount }),
    },
  });

  logger.info("File status updated via internal API", {
    fileId,
    indexStatus: body.indexStatus,
    chunkCount: body.chunkCount,
  });

  res.json({ fileId, indexStatus: body.indexStatus });
});

export default router;
