import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  CORS_ORIGIN: z.string().url().optional(),
  REDIS_URL: z.string().url(),
  CHANNEL_SERVICE_URL: z.string().url(),
  CALLBACK_SECRET: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  FRONTEND_URL: z.string().url(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌ Invalid environment variables:",
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const env = parsed.data;
