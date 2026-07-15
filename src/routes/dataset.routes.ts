import { Router } from "express";
import * as ctrl from "../controllers/dataset.controller.js";

const router = Router();
router.post("/upload", ctrl.upload);
router.get("/", ctrl.list);
router.get("/:id/rows", ctrl.rows);
router.get("/:id", ctrl.getOne);
router.delete("/:id", ctrl.remove);
export default router;
