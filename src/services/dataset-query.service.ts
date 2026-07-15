import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env.js";
import { readonlyPool } from "../config/readonly-db.js";
import { assertSafeSelect, enforceLimit } from "./sql-guard.service.js";
import { buildSchemaPrompt } from "./dataset.service.js";
import type { ChatMessage } from "./ai.service.js";

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

interface Column {
  name: string;
  key: string;
  type: string;
  sampleValues: string[];
}

export interface DatasetQueryResult {
  sql: string;
  rows: Record<string, unknown>[];
  rowCount: number;
}

function extractSql(t: string) {
  return t
    .replace(/```sql\s*/gi, "")
    .replace(/```/g, "")
    .trim();
}

function enforceDatasetScope(sql: string, datasetId: string): string {
  return `SELECT * FROM (${sql}) AS ai_q`;
}

export async function runDatasetQuery(
  messages: ChatMessage[],
  datasetId: string,
  datasetName: string,
  columns: Column[],
): Promise<DatasetQueryResult> {
  const schema = buildSchemaPrompt(datasetId, datasetName, columns);
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const correction =
      attempt === 2 && lastError instanceof Error
        ? `\n\nYour previous SQL failed: "${lastError.message}". Fix it. Remember: fields are in data->>'key', numbers need ::numeric casts, and you MUST filter WHERE dataset_id = '${datasetId}'. Return ONLY the SQL.`
        : "";

    const contents = [
      { role: "user" as const, parts: [{ text: schema }] },
      {
        role: "model" as const,
        parts: [
          {
            text: "Understood. I will return one SELECT scoped to this dataset.",
          },
        ],
      },
      ...messages.map((m) => ({
        role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
        parts: [{ text: m.content }],
      })),
      ...(correction
        ? [{ role: "user" as const, parts: [{ text: correction }] }]
        : []),
    ];

    const result = await model.generateContent({
      contents,
      generationConfig: { temperature: 0 },
    });

    const rawSql = extractSql(result.response.text());
    console.log("[dataset-query] generated SQL:", rawSql);

    try {
      const safe = assertSafeSelect(rawSql);

      if (!safe.includes(datasetId)) {
        throw new Error("Query did not scope to the active dataset.");
      }

      const limited = enforceLimit(safe, 100);
      const q = await readonlyPool.query(limited);
      return { sql: safe, rows: q.rows, rowCount: q.rowCount ?? q.rows.length };
    } catch (err) {
      lastError = err;
      console.warn(
        `[dataset-query] attempt ${attempt} failed:`,
        (err as Error).message,
      );
    }
  }

  throw new Error(
    `Could not answer that query. ${lastError instanceof Error ? lastError.message : ""}`,
  );
}
