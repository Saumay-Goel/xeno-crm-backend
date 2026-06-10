import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as aiController from "../controllers/ai.controller.js";

const router = Router();

router.post("/propose", asyncHandler(aiController.propose));

export default router;
