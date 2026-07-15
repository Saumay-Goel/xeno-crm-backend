import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env.js";
import { z } from "zod";

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const chatSchema = z.object({
  kind: z.literal("chat"),
  message: z.string().min(1),
});

const clarificationSchema = z.object({
  kind: z.literal("clarification"),
  question: z.string().min(1),
  options: z.array(z.string()).optional(),
});

const querySchema = z.object({
  kind: z.literal("query"),
  intent: z.string().min(1),
  sql: z.string().min(1).optional(),
});

const datasetCampaignSchema = z.object({
  kind: z.literal("dataset_campaign"),
  intent: z.string().min(1),
});

const responseSchema = z.discriminatedUnion("kind", [
  clarificationSchema,
  querySchema,
  chatSchema,
  datasetCampaignSchema,
]);

export type CustomerQuery = z.infer<typeof querySchema>;
export type Clarification = z.infer<typeof clarificationSchema>;
export type ChatReply = z.infer<typeof chatSchema>;
export type DatasetCampaign = z.infer<typeof datasetCampaignSchema>;

export type AiResponse =
  | Clarification
  | CustomerQuery
  | ChatReply
  | DatasetCampaign;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are the assistant inside an AI-native CRM. The user uploads their own dataset (any columns), and you help them EXPLORE it or build CAMPAIGNS over it. You respond with ONLY ONE JSON object per turn (no markdown, no backticks, no commentary), in ONE of these shapes:

CRITICAL ROUTING RULE (check this FIRST):
- If the message is a greeting, thanks, or small talk ("hi", "hello", "hey", "what can you do", "help", "thanks", "who are you"), return { "kind": "chat", "message": "..." } — a short friendly reply mentioning you can explore their data or build a campaign. NEVER build a query or campaign for a greeting.

QUERY — the user wants to SEE, LIST, COUNT, FIND, or ASK ABOUT their data (including follow-ups about previously shown results):
{
  "kind": "query",
  "intent": string      // short restatement, e.g. "Customers in Ecuador"
}
(The actual SQL is generated separately against the user's active dataset — you only classify the intent.)

DATASET_CAMPAIGN — the user wants to SEND / MESSAGE / run a CAMPAIGN to rows of their data:
{
  "kind": "dataset_campaign",
  "intent": string      // restate the campaign request, e.g. "Send a 20% discount to customers in Ecuador"
}

CLARIFICATION — genuinely ambiguous or impossible:
{
  "kind": "clarification",
  "question": string,
  "options": string[]
}

RULES:
- Questions ABOUT data — "show…", "list…", "is there…", "how many…", "which of these…", "who is the top…" — are ALWAYS a QUERY.
- Requests to SEND / MESSAGE / DISCOUNT / EMAIL / CAMPAIGN to rows are ALWAYS a DATASET_CAMPAIGN.
- The active dataset's real columns are provided in a follow-up system note. Treat ANY column mentioned there as valid — never claim a column doesn't exist if it's listed.
- Follow-ups like "these", "those", "the list", "your list" refer to the most recent query's audience.`;

function extractJson(text: string): string {
  return text
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();
}

function isOverloaded(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("503") ||
    msg.includes("overloaded") ||
    msg.includes("high demand") ||
    msg.includes("Service Unavailable")
  );
}

function buildContents(messages: ChatMessage[], correction?: string) {
  const contents: Array<{
    role: "user" | "model";
    parts: Array<{ text: string }>;
  }> = [
    { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
    {
      role: "model",
      parts: [
        {
          text: "Understood. I will respond with only the JSON object, in one of the allowed shapes, using the full conversation context.",
        },
      ],
    },
  ];

  for (const m of messages) {
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }

  if (correction) {
    contents.push({ role: "user", parts: [{ text: correction }] });
  }

  return contents;
}

async function callGemini(
  messages: ChatMessage[],
  correction?: string,
): Promise<string> {
  for (let i = 0; i <= 2; i++) {
    try {
      const result = await model.generateContent({
        contents: buildContents(messages, correction),
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
        },
      });
      return result.response.text();
    } catch (err) {
      if (isOverloaded(err) && i < 2) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Gemini unavailable");
}

export async function generateResponse(
  messages: ChatMessage[],
  correction?: string,
): Promise<AiResponse> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const raw = await callGemini(
      messages,
      correction ??
        (attempt === 2
          ? "(Your previous response was invalid JSON or didn't match any allowed shape. Respond with ONLY the valid JSON object.)"
          : undefined),
    );

    try {
      const parsed = JSON.parse(extractJson(raw));
      const validated = responseSchema.parse(parsed);
      return validated as AiResponse;
    } catch (err) {
      lastError = err;
      console.warn(
        `[ai] attempt ${attempt} failed validation:`,
        (err as Error).message,
      );
      console.warn(`[ai] raw response was:`, raw.slice(0, 500));
    }
  }

  throw new Error(
    `AI could not produce a valid response. ${lastError instanceof Error ? lastError.message : ""}`,
  );
}
