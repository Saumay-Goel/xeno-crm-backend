import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as orderController from "../controllers/order.controller.js";

const router = Router();

router.get("/", asyncHandler(orderController.list));

export default router;
