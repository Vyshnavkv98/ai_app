import { Router } from "express";
import multer from "multer";
import { fileController } from "../controllers/file.controller";
import { injectWorkspace } from "../middleware/roles";

const router = Router();

// multer — memory storage, 50 MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.use(injectWorkspace);

router.post("/upload", upload.single("file"), (req, res) => fileController.upload(req, res));
router.get("/", (req, res) => fileController.list(req, res));
router.get("/:fileId", (req, res) => fileController.getById(req, res));
router.delete("/:fileId", (req, res) => fileController.remove(req, res));
router.post("/:fileId/reindex", (req, res) => fileController.reindex(req, res));

export default router;
