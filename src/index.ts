import "dotenv/config";
import express from "express";
import cors from "cors";
import { Router } from "express";
import { env } from "./config/env.js";

import { errorMiddleware } from "./middleware/error.middleware.js";
import receiptRoutes from "./routes/receipt.routes.js";
import campaignRoutes from "./routes/campaign.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import insightsRoutes from "./routes/insights.routes.js";
import authRoutes from "./routes/auth.routes.js";
import { requireAuth } from "./middleware/auth.middleware.js";
import datasetRoutes from "./routes/dataset.routes.js";

import "./queue/send.worker.js";

const app = express();
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json());
const router = Router();

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "crm", ts: new Date().toISOString() });
});

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "working!", ts: new Date().toISOString() });
});

router.use("/auth", authRoutes);
router.use("/receipts", receiptRoutes);
router.use("/campaigns", requireAuth, campaignRoutes);
router.use("/insights", requireAuth, insightsRoutes);
router.use("/ai", requireAuth, aiRoutes);
router.use("/datasets", requireAuth, datasetRoutes);
app.use("/api", router);

app.use(errorMiddleware);

app.listen(env.PORT, () => {
  console.log(`[crm] listening on :${env.PORT}`);
});
