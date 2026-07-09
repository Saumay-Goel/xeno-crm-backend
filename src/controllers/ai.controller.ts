import type { Request, Response } from "express";
import { z } from "zod";
import { generateProposal } from "../services/ai.service.js";
import { previewSegment } from "../services/segment.service.js";
import { runNlQuery } from "../services/nl-query.service.js";

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
    result = await generateProposal(messages);
  } catch {
    return res.json({
      kind: "clarification",
      question:
        'I couldn\'t interpret that. Try asking to see customers (e.g. "show me customers in Mumbai over ₹5000") or to build a campaign.',
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
    try {
      const nl = await runNlQuery(messages);
      return res.json({
        kind: "query",
        intent: result.intent,
        rows: nl.rows,
        rowCount: nl.rowCount,
        sql: nl.sql,
      });
    } catch (err) {
      return res.json({
        kind: "clarification",
        question:
          err instanceof Error
            ? `I couldn't run that query: ${err.message}`
            : "I couldn't run that query.",
        options: [],
      });
    }
  }

  const audience = await previewSegment(result.rules);
  res.json({ kind: "proposal", proposal: result, audience });
}
