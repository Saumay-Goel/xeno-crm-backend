import type { Request, Response } from "express";
import { z } from "zod";
import * as insightsService from "../services/insight.service";

const idParam = z.object({ id: z.string().uuid() });

export async function campaignFunnel(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const result = await insightsService.getCampaignFunnel(id);
  if (!result) return res.status(404).json({ error: "Campaign not found" });
  res.json(result);
}

export async function dashboard(_req: Request, res: Response) {
  const stats = await insightsService.getDashboardStats();
  res.json(stats);
}
