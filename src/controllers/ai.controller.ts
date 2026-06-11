import type { Request, Response } from "express";
import { z } from "zod";
import { generateProposal } from "../services/ai.service.js";
import { previewSegment } from "../services/segment.service.js";

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

  const result = await generateProposal(messages);

  if (result.kind === "clarification") {
    return res.json({
      kind: "clarification",
      question: result.question,
      options: result.options ?? [],
    });
  }

  const audience = await previewSegment(result.rules);
  res.json({ kind: "proposal", proposal: result, audience });
}
