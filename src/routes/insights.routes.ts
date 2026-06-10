import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as insightsController from "../controllers/insight.controller.js";

const router = Router();

router.get(
  "/campaigns/:id/funnel",
  asyncHandler(insightsController.campaignFunnel),
);
router.get("/dashboard", asyncHandler(insightsController.dashboard));
export default router;
