import type { Request, Response } from "express";
import { z } from "zod";
import { generateResponse } from "../services/ai.service.js";
import {
  getDataset,
  detectContactColumns,
} from "../services/dataset.service.js";
import { runDatasetQuery } from "../services/dataset-query.service.js";
import { generateCampaignDetails } from "../services/campaign-details.service.js";

function getUserId(req: Request): string {
  return (req as Request & { userId: string }).userId;
}

const proposeSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
      }),
    )
    .min(1),
  datasetId: z.string().uuid().optional(),
});

export async function propose(req: Request, res: Response) {
  const { messages, datasetId } = proposeSchema.parse(req.body);
  console.log(
    "[propose] received:",
    messages.at(-1)?.content,
    "| dataset:",
    datasetId,
  );

  let activeDataset = null;
  let datasetContext: string | undefined;
  if (datasetId) {
    activeDataset = await getDataset(datasetId, getUserId(req));
    if (activeDataset) {
      const cols = activeDataset.columns
        .map((c) => `${c.key} (${c.type})`)
        .join(", ");
      datasetContext = `The user has an ACTIVE DATASET named "${activeDataset.name}". Its ONLY valid columns are: ${cols}.

- View/filter/count/find rows → kind "query". You can filter on ANY of the columns above. If the user mentions a value in one of these columns (a country, company, name, etc.), that is ALWAYS a valid query — never claim a column doesn't exist when it's listed above.
- Send/message/campaign to rows → kind "dataset_campaign" with just an "intent" string.`;
    }
  }

  let result;
  try {
    result = await generateResponse(messages, datasetContext);
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
        : "I couldn't interpret that. Try asking about your data or to build a campaign.",
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
    if (!datasetId || !activeDataset) {
      return res.json({
        kind: "clarification",
        question: "Select a dataset first to explore your data.",
        options: [],
      });
    }
    try {
      const r = await runDatasetQuery(
        messages,
        datasetId,
        activeDataset.name,
        activeDataset.columns,
      );
      return res.json({
        kind: "query",
        intent: result.intent,
        rows: r.rows,
        rowCount: r.rowCount,
        sql: r.sql,
      });
    } catch (err) {
      return res.json({
        kind: "clarification",
        question: `I couldn't run that query: ${(err as Error).message}`,
        options: [],
      });
    }
  }

  if (result.kind === "dataset_campaign") {
    if (!datasetId || !activeDataset) {
      return res.json({
        kind: "clarification",
        question: "Select a dataset first.",
        options: [],
      });
    }
    try {
      const contacts = detectContactColumns(activeDataset.columns);
      if (contacts.length === 0) {
        return res.json({
          kind: "clarification",
          question:
            "This dataset has no email or phone column, so I can't send a campaign to it.",
          options: [],
        });
      }

      const audienceMessages = [
        ...messages.slice(0, -1),
        {
          role: "user" as const,
          content: `List the rows that match this audience: "${messages.at(-1)?.content}". Return their identifying columns. This is a SELECT query to find WHO the audience is — do NOT interpret it as an action like sending or discounting.`,
        },
      ];
      const audience = await runDatasetQuery(
        audienceMessages,
        datasetId,
        activeDataset.name,
        activeDataset.columns,
      );

      const details = await generateCampaignDetails(
        messages,
        activeDataset.name,
        activeDataset.columns,
        contacts,
      );

      return res.json({
        kind: "dataset_proposal",
        proposal: {
          segmentName: details.segmentName,
          contactColumn: details.contactColumn,
          channel: details.channel,
          message: details.message,
          reasoning: details.reasoning,
          assumptions: details.assumptions,
          audienceSql: audience.sql,
        },
        audience: {
          count: audience.rowCount,
          sample: audience.rows.slice(0, 5),
        },
        contactCandidates: contacts,
      });
    } catch (err) {
      return res.json({
        kind: "clarification",
        question: `I couldn't build that campaign: ${(err as Error).message}`,
        options: [],
      });
    }
  }

  console.warn("[propose] unhandled result:", JSON.stringify(result));
  return res.json({
    kind: "clarification",
    question:
      "I'm not sure how to help with that. Try asking about your data or to build a campaign.",
    options: [],
  });
}
