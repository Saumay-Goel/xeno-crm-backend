import type { Request, Response } from "express";
import { z } from "zod";
import * as customerService from "../services/customer.service.js";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  city: z.string().trim().optional(),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

export async function list(req: Request, res: Response) {
  const params = listQuerySchema.parse(req.query);
  const result = await customerService.listCustomers(params);
  res.json(result);
}

export async function getOne(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  const customer = await customerService.getCustomerById(id);
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  res.json(customer);
}
