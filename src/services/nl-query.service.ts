import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env.js";
import { readonlyPool } from "../config/readonly-db.js";
import { assertSafeSelect, enforceLimit } from "./sql-guard.service.js";

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

const SCHEMA_PROMPT = `You are a PostgreSQL expert for a marketing CRM. Translate the user's question into ONE read-only SQL SELECT query.

DATABASE SCHEMA (PostgreSQL):

Table "customers":
  id            text (uuid, primary key)
  name          text
  email         text
  phone         text (nullable)
  city          text (nullable)  -- values: Mumbai, Delhi, Bangalore, Chennai, Hyderabad, Pune, Kolkata, Ahmedabad
  attributes    jsonb (nullable) -- may contain "signupSource": organic | ads | referral
  "createdAt"   timestamp

Table "orders":
  id            text (uuid, primary key)
  "customerId"  text  -- FK -> customers.id
  amount        numeric
  "orderedAt"   timestamp

RELATIONSHIPS:
- A customer has many orders (orders."customerId" = customers.id).

DERIVED METRICS you may need (compute with joins/aggregates):
- total spend      = SUM(orders.amount) per customer
- order count      = COUNT(orders.id) per customer
- days since last order = EXTRACT(DAY FROM now() - MAX(orders."orderedAt"))

RULES:
- Return ONLY the raw SQL. No markdown, no backticks, no explanation.
- SELECT only. Never write, modify, or use DDL.
- Column names "customerId", "orderedAt", "createdAt" are camelCase — you MUST double-quote them.
- Always include the customer's id, name, email, city in the SELECT when returning customers, plus any metric the question asks about, aliased clearly (e.g. AS "totalSpend", AS "orderCount").
- Use ILIKE for case-insensitive text matching (names, cities).
- If the question is about customers, return customer rows. If it's a count/aggregate, return that.
- Limit results sensibly; do not return more than 100 rows.`;

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
        ? `\n\nYour previous SQL failed with: "${lastError.message}". Fix it and return ONLY corrected SQL.`
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
