import type { Request, Response } from "express";
import * as authService from "../services/auth.service.js";
import { env } from "../config/env.js";
import { z } from "zod";

export function googleStart(_req: Request, res: Response) {
  res.redirect(authService.getGoogleAuthUrl());
}

export async function googleCallback(req: Request, res: Response) {
  const code = req.query.code as string | undefined;
  if (!code) return res.redirect(`${env.FRONTEND_URL}/login?error=no_code`);

  try {
    const token = await authService.handleGoogleCallback(code);
    res.redirect(`${env.FRONTEND_URL}/api/auth/set?token=${token}`);
  } catch (err) {
    console.error("[auth] google callback failed:", err);
    res.redirect(`${env.FRONTEND_URL}/login?error=auth_failed`);
  }
}

export async function me(req: Request, res: Response) {
  const userId = (req as Request & { userId?: string }).userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const user = await authService.getUserById(userId);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  res.json(user);
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().optional(),
});

export async function register(req: Request, res: Response) {
  const { email, password, name } = credentialsSchema.parse(req.body);
  const token = await authService.registerWithPassword(email, password, name);
  res.status(201).json({ token });
}

export async function login(req: Request, res: Response) {
  const { email, password } = credentialsSchema
    .omit({ name: true })
    .parse(req.body);
  const token = await authService.loginWithPassword(email, password);
  res.json({ token });
}
