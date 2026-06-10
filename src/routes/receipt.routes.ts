import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as receiptController from "../controllers/receipt.controller.js";

const router = Router();

router.post("/", asyncHandler(receiptController.ingest));

export default router;
