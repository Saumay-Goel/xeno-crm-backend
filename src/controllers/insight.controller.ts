import type { Request, Response } from "express";
import { z } from "zod";
import * as insightsService from "../services/insight.service.js";

const idParam = z.object({ id: z.string().uuid() });

function getUserId(req: Request): string {
  return (req as Request & { userId: string }).userId;
}

export async function campaignFunnel(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const result = await insightsService.getCampaignFunnel(id, getUserId(req));
  if (!result) return res.status(404).json({ error: "Campaign not found" });
  res.json(result);
}

export async function dashboard(req: Request, res: Response) {
  const stats = await insightsService.getDashboardStats(getUserId(req));
  res.json(stats);
}
