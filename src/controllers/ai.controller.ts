import type { Request, Response } from "express";
import { z } from "zod";
import { generateResponse } from "../services/ai.service.js";
import { previewSegment } from "../services/segment.service.js";
import {
  assertSafeSelect,
  enforceLimit,
} from "../services/sql-guard.service.js";
import { readonlyPool } from "../config/readonly-db.js";

const proposeSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
      }),
    )
    .min(1),
});

export async function propose(req: Request, res: Response) {
  const { messages } = proposeSchema.parse(req.body);

  let result;
  try {
    result = await generateResponse(messages);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    const overloaded =
      msg.includes("503") ||
      msg.includes("unavailable") ||
      msg.includes("high demand");
    return res.json({
      kind: "clarification",
      question: overloaded
        ? "The AI service is briefly overloaded — please try again in a moment."
        : 'I couldn\'t interpret that. Try asking to see customers (e.g. "show me customers in Mumbai over ₹5000") or to build a campaign.',
      options: [],
    });
  }

  if (result.kind === "clarification") {
    return res.json({
      kind: "clarification",
      question: result.question,
      options: result.options ?? [],
    });
  }

  if (result.kind === "query") {
    // Execute the AI's SQL with guards; on SQL error, feed it back once for self-correction.
    let sql = result.sql;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const safe = assertSafeSelect(sql);
        const limited = enforceLimit(safe, 100);
        console.log("[nl-query] executing SQL:", safe);
        const query = await readonlyPool.query(limited);
        return res.json({
          kind: "query",
          intent: result.intent,
          rows: query.rows,
          rowCount: query.rowCount ?? query.rows.length,
          sql: safe,
        });
      } catch (err) {
        const errMsg = (err as Error).message;
        console.warn(`[nl-query] attempt ${attempt} failed:`, errMsg);
        if (attempt === 2) {
          return res.json({
            kind: "clarification",
            question: `I couldn't run that query: ${errMsg}`,
            options: [],
          });
        }
        // Ask the AI to fix its SQL, giving it the DB error.
        try {
          const retry = await generateResponse(
            messages,
            `Your SQL failed with this PostgreSQL error: "${errMsg}". Fix it — use exact lowercase snake_case columns (customer_id, ordered_at, created_at), no double quotes. Respond with the corrected query JSON only.`,
          );
          if (retry.kind === "query") {
            sql = retry.sql;
          } else {
            return res.json(
              retry.kind === "clarification"
                ? {
                    kind: "clarification",
                    question: retry.question,
                    options: retry.options ?? [],
                  }
                : {
                    kind: "clarification",
                    question: "I couldn't run that query.",
                    options: [],
                  },
            );
          }
        } catch {
          return res.json({
            kind: "clarification",
            question: "I couldn't run that query. Please rephrase it.",
            options: [],
          });
        }
      }
    }
    return;
  }

  // proposal
  const audience = await previewSegment(result.rules);
  res.json({ kind: "proposal", proposal: result, audience });
}
