import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env.js";
import { readonlyPool } from "../config/readonly-db.js";
import { assertSafeSelect, enforceLimit } from "./sql-guard.service.js";

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

const SCHEMA_PROMPT = `You are a PostgreSQL expert for a marketing CRM. Translate the user's question into ONE read-only SQL SELECT query.

CRITICAL QUOTING RULE:
This database uses camelCase column names created by Prisma. In PostgreSQL, camelCase identifiers MUST be wrapped in double quotes or they will fail. ALWAYS double-quote these exact columns everywhere they appear (in SELECT, WHERE, JOIN, GROUP BY):
  "customerId", "orderedAt", "createdAt"
Lowercase columns (id, name, email, phone, city, amount, attributes) do NOT need quotes.

DATABASE SCHEMA:

Table customers:
  id            text (uuid, primary key)
  name          text
  email         text
  phone         text (nullable)
  city          text (nullable)  -- Mumbai, Delhi, Bangalore, Chennai, Hyderabad, Pune, Kolkata, Ahmedabad
  attributes    jsonb (nullable) -- may contain "signupSource": organic | ads | referral
  "createdAt"   timestamp

Table orders:
  id            text (uuid, primary key)
  "customerId"  text  -- FK -> customers.id
  amount        numeric
  "orderedAt"   timestamp

JOIN EXAMPLE (copy this quoting style exactly):
  SELECT c.id, c.name, c.email, c.city, SUM(o.amount) AS "totalSpend"
  FROM customers c
  JOIN orders o ON o."customerId" = c.id
  WHERE c.city ILIKE 'Mumbai'
  GROUP BY c.id, c.name, c.email, c.city
  HAVING SUM(o.amount) > 5000

DERIVED METRICS:
- total spend = SUM(o.amount)
- order count = COUNT(o.id)
- days since last order = EXTRACT(DAY FROM now() - MAX(o."orderedAt"))

RULES:
- Return ONLY raw SQL. No markdown, no backticks, no explanation.
- SELECT only. Never write or use DDL.
- ALWAYS double-quote "customerId", "orderedAt", "createdAt".
- When returning customers, SELECT at least id, name, email, city, plus any metric asked for, aliased (e.g. AS "totalSpend").
- Use ILIKE for text matching.
- Never return more than 100 rows.`;

function extractSql(text: string): string {
  return text
    .replace(/```sql\s*/gi, "")
    .replace(/```/g, "")
    .trim();
}

export interface NlQueryResult {
  sql: string;
  rows: Record<string, unknown>[];
  rowCount: number;
}

export async function runNlQuery(question: string): Promise<NlQueryResult> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const correction =
      attempt === 2 && lastError instanceof Error
        ? `\n\nYour previous SQL failed with: "${lastError.message}". This is likely a missing double-quote on a camelCase column like "customerId" or "orderedAt". Fix the quoting and return ONLY corrected SQL.`
        : "";

    const result = await model.generateContent({
      contents: [
        { role: "user", parts: [{ text: SCHEMA_PROMPT }] },
        {
          role: "model",
          parts: [
            { text: "Understood. I will return only a single SELECT query." },
          ],
        },
        { role: "user", parts: [{ text: question + correction }] },
      ],
      generationConfig: { temperature: 0.1 },
    });

    const rawSql = extractSql(result.response.text());

    try {
      const safe = assertSafeSelect(rawSql);
      const limited = enforceLimit(safe, 100);
      const query = await readonlyPool.query(limited);
      return {
        sql: safe,
        rows: query.rows,
        rowCount: query.rowCount ?? query.rows.length,
      };
    } catch (err) {
      lastError = err;
      console.warn(
        `[nl-query] attempt ${attempt} failed:`,
        (err as Error).message,
      );
    }
  }

  throw new Error(
    `Could not answer that query. ${lastError instanceof Error ? lastError.message : ""}`,
  );
}
