import type { Request, Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import * as receiptService from "../services/receipt.service.js";

const receiptSchema = z.object({
  communicationId: z.string().uuid(),
  event: z.enum([
    "delivered",
    "failed",
    "opened",
    "read",
    "clicked",
    "converted",
  ]),
  occurredAt: z.string(),
});

export async function ingest(req: Request, res: Response) {
  // Verify the callback actually came from our channel service.
  if (req.header("x-callback-secret") !== env.CALLBACK_SECRET) {
    return res.status(401).json({ error: "Invalid callback secret" });
  }

  const { communicationId, event, occurredAt } = receiptSchema.parse(req.body);
  const result = await receiptService.ingestReceipt(
    communicationId,
    event,
    occurredAt,
  );
  res.json(result);
}
