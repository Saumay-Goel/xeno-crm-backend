import "dotenv/config";
import express from "express";
import cors from "cors";
import { Router } from "express";
import { env } from "./config/env.js";
import customerRoutes from "./routes/customer.routes.js";
import orderRoutes from "./routes/order.routes.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import segmentRoutes from "./routes/segment.routes.js";
import receiptRoutes from "./routes/receipt.routes.js";
import campaignRoutes from "./routes/campaign.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import insightsRoutes from "./routes/insights.routes.js";
import authRoutes from "./routes/auth.routes.js";
import { requireAuth } from "./middleware/auth.middleware.js";
import "./queue/send.worker.js";

const app = express();
app.use(cors());
app.use(express.json());
const router = Router();

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "crm", ts: new Date().toISOString() });
});

router.use("/auth", authRoutes);
router.use("/customers", customerRoutes);
router.use("/orders", orderRoutes);
router.use("/segments", segmentRoutes);
router.use("/receipts", receiptRoutes);
router.use("/campaigns", campaignRoutes);
router.use("/insights", insightsRoutes);
router.use("/ai", aiRoutes);
router.use("/auth", authRoutes);
app.use("/api", router);

app.use(errorMiddleware);

app.listen(env.PORT, () => {
  console.log(`[crm] listening on :${env.PORT}`);
});
