import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as segmentController from "../controllers/segment.controller.js";

const router = Router();

router.post("/preview", asyncHandler(segmentController.preview));
router.post("/", asyncHandler(segmentController.create));
router.get("/", asyncHandler(segmentController.list));
router.get("/:id", asyncHandler(segmentController.getOne));

export default router;
