import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";

const oauthClient = new OAuth2Client(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_CALLBACK_URL,
);

export function getGoogleAuthUrl(): string {
  return oauthClient.generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile"],
    prompt: "select_account",
  });
}

export async function handleGoogleCallback(code: string): Promise<string> {
  const { tokens } = await oauthClient.getToken(code);
  const ticket = await oauthClient.verifyIdToken({
    idToken: tokens.id_token!,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.email || !payload.sub)
    throw new Error("Invalid Google profile");

  const user = await prisma.user.upsert({
    where: { googleId: payload.sub },
    update: {
      email: payload.email,
      name: payload.name,
      avatarUrl: payload.picture,
    },
    create: {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name,
      avatarUrl: payload.picture,
    },
  });

  return jwt.sign({ sub: user.id, email: user.email }, env.JWT_SECRET, {
    expiresIn: "7d",
  });
}

export interface JwtPayload {
  sub: string;
  email: string;
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, avatarUrl: true },
  });
}

function signToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email }, env.JWT_SECRET, { expiresIn: "7d" });
}

export async function registerWithPassword(
  email: string,
  password: string,
  name?: string,
): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("An account with this email already exists");

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, name: name ?? null },
  });
  return signToken(user.id, user.email);
}

export async function loginWithPassword(
  email: string,
  password: string,
): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) throw new Error("Invalid email or password");

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new Error("Invalid email or password");

  return signToken(user.id, user.email);
}
