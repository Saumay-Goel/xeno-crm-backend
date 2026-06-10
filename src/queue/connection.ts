import IORedis from "ioredis";
import { env } from "../config/env.js";

const isUpstash = env.REDIS_URL.startsWith("rediss://");

export const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  ...(isUpstash ? { tls: {} } : {}),
});

redisConnection.on("error", (err) =>
  console.error("[redis] error:", err.message),
);
redisConnection.on("connect", () => console.log("[redis] connected"));
