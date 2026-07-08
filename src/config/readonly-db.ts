import { Pool } from "pg";
import { env } from "./env.js";

export const readonlyPool = new Pool({
  connectionString: env.READONLY_DATABASE_URL,
  max: 5,
  statement_timeout: 5000,
  query_timeout: 5000,
});

readonlyPool.on("error", (err) => {
  console.error("[readonly-db] pool error:", err.message);
});
