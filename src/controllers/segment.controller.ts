import type { Request, Response } from "express";
import { z } from "zod";
import * as segmentService from "../services/segment.service.js";
import { ruleSchema } from "../services/segment.schema.js";
import type { Rule } from "../types/segment.types.js";

const previewSchema = z.object({ rules: ruleSchema });
const createSchema = z.object({ name: z.string().min(1), rules: ruleSchema });
const idParam = z.object({ id: z.string().uuid() });

function getUserId(req: Request): string {
  return (req as Request & { userId: string }).userId;
}

export async function preview(req: Request, res: Response) {
  const { rules } = previewSchema.parse(req.body);
  const result = await segmentService.previewSegment(rules as Rule);
  res.json(result);
}

export async function create(req: Request, res: Response) {
  const { name, rules } = createSchema.parse(req.body);
  const segment = await segmentService.createSegment(
    getUserId(req),
    name,
    rules as Rule,
  );
  res.status(201).json(segment);
}

export async function list(req: Request, res: Response) {
  res.json(await segmentService.listSegments(getUserId(req)));
}

export async function getOne(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const segment = await segmentService.getSegment(id, getUserId(req));
  if (!segment) return res.status(404).json({ error: "Segment not found" });
  const { count } = await segmentService.previewSegment(
    segment.rules as unknown as Rule,
  );
  res.json({ ...segment, matchCount: count });
}
