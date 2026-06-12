import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as customerController from "../controllers/customer.controller.js";

const router = Router();

router.get("/", asyncHandler(customerController.list));
router.get("/:id", asyncHandler(customerController.getOne));

export default router;
