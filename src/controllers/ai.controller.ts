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
  console.log("[propose] received:", req.body?.messages?.at(-1)?.content);
  const { messages } = proposeSchema.parse(req.body);

  let result;
  try {
    result = await generateResponse(messages);
    console.log("[propose] AI returned:", JSON.stringify(result));
  } catch (err) {
    console.error("[ai] generateResponse threw:", err);
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

  if (result.kind === "chat") {
    return res.json({ kind: "chat", message: result.message });
  }

  if (result.kind === "clarification") {
    return res.json({
      kind: "clarification",
      question: result.question,
      options: result.options ?? [],
    });
  }

  if (result.kind === "query") {
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
        try {
          const retry = await generateResponse(
            messages,
            `Your SQL failed with this PostgreSQL error: "${errMsg}". Fix it — use exact lowercase snake_case columns (customer_id, ordered_at, created_at), no double quotes. Respond with the corrected query JSON only.`,
          );
          if (retry.kind === "query") {
            sql = retry.sql;
          } else if (retry.kind === "chat") {
            return res.json({ kind: "chat", message: retry.message });
          } else if (retry.kind === "clarification") {
            return res.json({
              kind: "clarification",
              question: retry.question,
              options: retry.options ?? [],
            });
          } else {
            return res.json({
              kind: "clarification",
              question: "I couldn't run that query.",
              options: [],
            });
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

  if (result.kind === "proposal") {
    const audience = await previewSegment(result.rules);
    return res.json({ kind: "proposal", proposal: result, audience });
  }

  console.warn("[propose] unhandled result:", JSON.stringify(result));
  return res.json({
    kind: "clarification",
    question:
      "I'm not sure how to help with that. Try asking to see customers or to build a campaign.",
    options: [],
  });
}
