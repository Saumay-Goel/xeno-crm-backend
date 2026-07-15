import type { Request, Response } from "express";
import { z } from "zod";
import * as campaignService from "../services/campaign.service.js";
import { launchDatasetCampaign } from "../services/dataset-campaign.service.js";

function getUserId(req: Request): string {
  return (req as Request & { userId: string }).userId;
}

const launchDatasetSchema = z.object({
  datasetId: z.string().uuid(),
  name: z.string().min(1),
  channel: z.enum(["whatsapp", "sms", "email", "rcs"]),
  contactColumn: z.string().min(1),
  messageTemplate: z.string().min(1),
  audienceSql: z.string().min(1),
});

const idParam = z.object({ id: z.string().uuid() });

export async function launchDataset(req: Request, res: Response) {
  const body = launchDatasetSchema.parse(req.body);
  const result = await launchDatasetCampaign({
    userId: getUserId(req),
    ...body,
  });
  res.status(201).json(result);
}

export async function list(req: Request, res: Response) {
  res.json(await campaignService.listCampaigns(getUserId(req)));
}

export async function getOne(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const campaign = await campaignService.getCampaign(id, getUserId(req));
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  res.json(campaign);
}
