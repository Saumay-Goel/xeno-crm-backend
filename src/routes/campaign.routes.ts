import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as campaignController from "../controllers/campaign.controller.js";

const router = Router();

router.get("/", asyncHandler(campaignController.list));
router.get("/:id", asyncHandler(campaignController.getOne));
router.post("/launch-dataset", asyncHandler(campaignController.launchDataset));
export default router;
