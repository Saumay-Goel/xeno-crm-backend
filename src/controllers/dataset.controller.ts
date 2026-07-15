import type { Request, Response } from "express";
import { z } from "zod";
import Papa from "papaparse";
import * as datasetService from "../services/dataset.service.js";

function getUserId(req: Request): string {
  return (req as Request & { userId: string }).userId;
}

const uploadSchema = z.object({
  name: z.string().min(1),
  csv: z.string().min(1),
});

export async function upload(req: Request, res: Response) {
  const { name, csv } = uploadSchema.parse(req.body);

  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    return res
      .status(400)
      .json({ error: "CSV parse error", details: parsed.errors[0] });
  }
  const headers = parsed.meta.fields ?? [];
  const rows = parsed.data;
  if (headers.length === 0 || rows.length === 0) {
    return res.status(400).json({ error: "CSV has no data" });
  }
  if (rows.length > 5000) {
    return res.status(400).json({ error: "Max 5000 rows for now" });
  }

  const dataset = await datasetService.createDatasetFromRows(
    getUserId(req),
    name,
    headers,
    rows,
  );
  res.status(201).json(dataset);
}

export async function list(req: Request, res: Response) {
  res.json(await datasetService.listDatasets(getUserId(req)));
}

export async function getOne(req: Request, res: Response) {
  const dataset = await datasetService.getDataset(
    String(req.params.id),
    getUserId(req),
  );
  if (!dataset) return res.status(404).json({ error: "Not found" });
  res.json(dataset);
}

export async function remove(req: Request, res: Response) {
  const ok = await datasetService.deleteDataset(
    String(req.params.id),
    getUserId(req),
  );
  if (!ok) return res.status(404).json({ error: "Not found" });
  res.json({ deleted: true });
}

export async function rows(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
  const data = await datasetService.getDatasetRows(
    String(req.params.id),
    getUserId(req),
    page,
    pageSize,
  );
  if (data === null) return res.status(404).json({ error: "Not found" });
  res.json(data);
}
