import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../services/auth.service.js";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }
  try {
    const payload = verifyToken(header.slice(7));
    (req as Request & { userId?: string }).userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}
