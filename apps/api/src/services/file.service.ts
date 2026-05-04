import { randomUUID } from "crypto";
import { prisma } from "../lib/prisma";
import { uploadToS3, deleteFromS3 } from "../lib/s3";
import { indexingQueue } from "../lib/queue";
import { aiServiceClient } from "../lib/ai-service";
import { writeAuditLog } from "../lib/audit";
import { NotFoundError, AppError } from "../middleware/error";
import { logger } from "../lib/logger";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
];

export class FileService {
  async upload(
    file: Express.Multer.File,
    userId: string,
    workspaceId: string,
    ipAddress?: string
  ) {
    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      throw new AppError(413, "File exceeds 50 MB limit", "FILE_TOO_LARGE");
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new AppError(
        415,
        `Unsupported file type: ${file.mimetype}. Allowed: PDF, DOCX, TXT, MD, CSV`,
        "UNSUPPORTED_FILE_TYPE"
      );
    }

    // Build S3 key: workspaceId/year-month/uuid-filename
    const date = new Date();
    const prefix = `${workspaceId}/${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const s3Key = `${prefix}/${randomUUID()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    // Upload to S3
    await uploadToS3(s3Key, file.buffer, file.mimetype);

    // Create DB record with PENDING status
    const fileRecord = await prisma.file.create({
      data: {
        name: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        s3Key,
        indexStatus: "PENDING",
        workspaceId,
        uploadedById: userId,
      },
    });

    // Enqueue indexing job
    const job = await indexingQueue.add("index-file", {
      fileId: fileRecord.id,
      s3Key,
      workspaceId,
    });

    await writeAuditLog({
      action: "file.uploaded",
      resourceType: "file",
      resourceId: fileRecord.id,
      userId,
      workspaceId,
      metadata: { name: file.originalname, sizeBytes: file.size, mimeType: file.mimetype },
      ipAddress,
    });

    logger.info("File uploaded and indexing queued", {
      fileId: fileRecord.id,
      jobId: job.id,
    });

    return {
      fileId: fileRecord.id,
      name: fileRecord.name,
      indexStatus: fileRecord.indexStatus,
      indexJobId: job.id,
    };
  }

  async list(workspaceId: string) {
    return prisma.file.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        mimeType: true,
        sizeBytes: true,
        indexStatus: true,
        chunkCount: true,
        createdAt: true,
      },
    });
  }

  async getById(fileId: string, workspaceId: string) {
    const file = await prisma.file.findFirst({
      where: { id: fileId, workspaceId },
    });
    if (!file) throw new NotFoundError("File not found");
    return file;
  }

  async delete(fileId: string, userId: string, workspaceId: string, ipAddress?: string) {
    const file = await prisma.file.findFirst({
      where: { id: fileId, workspaceId },
    });
    if (!file) throw new NotFoundError("File not found");

    // Delete from S3
    try {
      await deleteFromS3(file.s3Key);
    } catch (err) {
      logger.warn("S3 delete failed (continuing)", {
        fileId,
        s3Key: file.s3Key,
        error: (err as Error).message,
      });
    }

    // Delete vector embeddings from Pinecone via AI service
    try {
      await aiServiceClient.ragDeleteDocument(fileId);
    } catch (err) {
      logger.warn("Vector DB delete failed (continuing)", {
        fileId,
        error: (err as Error).message,
      });
    }

    // Delete DB record
    await prisma.file.delete({ where: { id: fileId } });

    await writeAuditLog({
      action: "file.deleted",
      resourceType: "file",
      resourceId: fileId,
      userId,
      workspaceId,
      metadata: { name: file.name },
      ipAddress,
    });
  }

  async reindex(fileId: string, workspaceId: string) {
    const file = await prisma.file.findFirst({
      where: { id: fileId, workspaceId },
    });
    if (!file) throw new NotFoundError("File not found");

    await prisma.file.update({
      where: { id: fileId },
      data: { indexStatus: "PENDING", chunkCount: null },
    });

    const job = await indexingQueue.add("index-file", {
      fileId: file.id,
      s3Key: file.s3Key,
      workspaceId,
    });

    return { fileId, indexJobId: job.id };
  }
}

export const fileService = new FileService();
