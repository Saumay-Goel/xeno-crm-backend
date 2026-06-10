import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import * as authController from "../controllers/auth.controller.js";

const router = Router();

router.get("/google", authController.googleStart);
router.get("/google/callback", asyncHandler(authController.googleCallback));
router.post("/register", asyncHandler(authController.register));
router.post("/login", asyncHandler(authController.login));
router.get("/me", requireAuth, asyncHandler(authController.me));

export default router;
