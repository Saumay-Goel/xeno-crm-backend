import type { Request, Response } from "express";
import { z } from "zod";
import * as orderService from "../services/order.service.js";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  customerId: z.string().uuid().optional(),
});

export async function list(req: Request, res: Response) {
  const params = listQuerySchema.parse(req.query);
  const result = await orderService.listOrders(params);
  res.json(result);
}
