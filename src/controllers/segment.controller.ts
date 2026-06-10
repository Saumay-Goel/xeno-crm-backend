import type { Request, Response } from "express";
import { z } from "zod";
import * as segmentService from "../services/segment.service.js";
import { ruleSchema } from "../services/segment.schema.js";
import type { Rule } from "../types/segment.types.js";

const previewSchema = z.object({ rules: ruleSchema });

const createSchema = z.object({
  name: z.string().min(1),
  rules: ruleSchema,
});

const idParam = z.object({ id: z.string().uuid() });

// POST /api/segments/preview  → { count, preview[] } without saving
export async function preview(req: Request, res: Response) {
  const { rules } = previewSchema.parse(req.body);
  const result = await segmentService.previewSegment(rules as Rule);
  res.json(result);
}

// POST /api/segments  → save a segment
export async function create(req: Request, res: Response) {
  const { name, rules } = createSchema.parse(req.body);
  const segment = await segmentService.createSegment(name, rules as Rule);
  res.status(201).json(segment);
}

// GET /api/segments
export async function list(_req: Request, res: Response) {
  res.json(await segmentService.listSegments());
}

// GET /api/segments/:id  (includes a fresh match count)
export async function getOne(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const segment = await segmentService.getSegment(id);
  if (!segment) return res.status(404).json({ error: "Segment not found" });
  const { count } = await segmentService.previewSegment(
    segment.rules as unknown as Rule,
  );
  res.json({ ...segment, matchCount: count });
}
