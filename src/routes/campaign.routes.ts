import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as campaignController from "../controllers/campaign.controller.js";

const router = Router();

router.post("/launch", asyncHandler(campaignController.launch));
router.get("/", asyncHandler(campaignController.list));
router.get("/:id", asyncHandler(campaignController.getOne));

export default router;
