import { Request, Response } from "express";
import { fileService } from "../services/file.service";
import { AppError } from "../middleware/error";

export class FileController {
  async upload(req: Request, res: Response): Promise<void> {
    if (!req.file) {
      throw new AppError(400, "No file provided", "NO_FILE");
    }
    const result = await fileService.upload(
      req.file,
      res.locals.user.id,
      res.locals.workspaceId,
      req.ip
    );
    res.status(202).json(result); // 202 Accepted — indexing is async
  }

  async list(_req: Request, res: Response): Promise<void> {
    const files = await fileService.list(res.locals.workspaceId);
    res.json(files);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const file = await fileService.getById(
      req.params.fileId,
      res.locals.workspaceId
    );
    res.json(file);
  }

  async remove(req: Request, res: Response): Promise<void> {
    await fileService.delete(
      req.params.fileId,
      res.locals.user.id,
      res.locals.workspaceId,
      req.ip
    );
    res.status(204).send();
  }

  async reindex(req: Request, res: Response): Promise<void> {
    const result = await fileService.reindex(
      req.params.fileId,
      res.locals.workspaceId
    );
    res.status(202).json(result);
  }
}

export const fileController = new FileController();
