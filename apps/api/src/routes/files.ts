import { Router } from "express";
import { fileController } from "../controllers/file.controller";
import { injectWorkspace } from "../middleware/roles";

const router = Router();

router.use(injectWorkspace);

router.post("/upload", (req, res) => fileController.upload(req, res));
router.get("/", (req, res) => fileController.list(req, res));
router.delete("/:fileId", (req, res) => fileController.remove(req, res));

export default router;
