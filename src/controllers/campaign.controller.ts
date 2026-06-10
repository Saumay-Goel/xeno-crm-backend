import type { Request, Response } from "express";
import { z } from "zod";
import * as campaignService from "../services/campaign.service";
import * as segmentService from "../services/segment.service.js";
import { ruleSchema } from "../services/segment.schema.js";
import type { Rule } from "../types/segment.types.js";

const channelEnum = z.enum(["whatsapp", "sms", "email", "rcs"]);

// Either segmentId OR inline rules must be provided.
const launchSchema = z
  .object({
    name: z.string().min(1),
    channel: channelEnum,
    messageTemplate: z.string().min(1),
    segmentId: z.string().uuid().optional(),
    inlineSegment: z
      .object({ name: z.string().min(1), rules: ruleSchema })
      .optional(),
  })
  .refine((d) => d.segmentId || d.inlineSegment, {
    message: "Provide either segmentId or inlineSegment",
  });

const idParam = z.object({ id: z.string().uuid() });

export async function launch(req: Request, res: Response) {
  const body = launchSchema.parse(req.body);

  let segmentId = body.segmentId;
  // If inline rules were given, persist them as a segment first.
  if (!segmentId && body.inlineSegment) {
    const seg = await segmentService.createSegment(
      body.inlineSegment.name,
      body.inlineSegment.rules as Rule,
    );
    segmentId = seg.id;
  }

  const result = await campaignService.launchCampaign({
    name: body.name,
    segmentId: segmentId!,
    channel: body.channel,
    messageTemplate: body.messageTemplate,
  });

  res.status(201).json(result);
}

export async function list(_req: Request, res: Response) {
  res.json(await campaignService.listCampaigns());
}

export async function getOne(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const campaign = await campaignService.getCampaign(id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  res.json(campaign);
}
