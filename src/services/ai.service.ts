import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env.js";
import { ruleSchema } from "./segment.schema.js";
import { z } from "zod";
import type { Rule } from "../types/segment.types.js";

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

const proposalSchema = z.object({
  kind: z.literal("proposal"),
  segmentName: z.string().min(1),
  rules: ruleSchema,
  message: z.string().min(1),
  channel: z.enum(["whatsapp", "sms", "email", "rcs"]),
  reasoning: z.string(),
  assumptions: z.array(z.string()).default([]),
});

const clarificationSchema = z.object({
  kind: z.literal("clarification"),
  question: z.string().min(1),
  options: z.array(z.string()).optional(),
});

const querySchema = z.object({
  kind: z.literal("query"),
  intent: z.string().min(1),
  rules: ruleSchema,
});

const responseSchema = z.discriminatedUnion("kind", [
  proposalSchema,
  clarificationSchema,
  querySchema,
]);

export type CustomerQuery = z.infer<typeof querySchema> & { rules: Rule };
export type CampaignProposal = z.infer<typeof proposalSchema> & { rules: Rule };
export type Clarification = z.infer<typeof clarificationSchema>;
export type AiResponse = CampaignProposal | Clarification | CustomerQuery;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are a marketing campaign assistant for a CRM. The marketer describes who they want to reach and what to say, in plain English, possibly across several turns of conversation. You translate that into a structured campaign proposal — OR, if they just want to explore the customer base, you return a query — OR, if the request is ambiguous or relies on data you don't have, you ask a clarifying question instead of guessing.

This is a CONVERSATION. Use the full history: if you previously asked a clarifying question and the marketer just answered it, combine their answer with the earlier intent. If they ask to adjust an earlier proposal (change the discount, the channel, the audience), produce an updated proposal reflecting the change.

You MUST respond with ONLY a valid JSON object (no markdown, no backticks, no commentary). It must be ONE of these three shapes:

PROPOSAL (use when the marketer wants to REACH or MESSAGE customers — launch a campaign):
{
  "kind": "proposal",
  "segmentName": string,
  "rules": Rule,
  "message": string,            // use {{name}} and {{city}} tokens where natural
  "channel": "whatsapp" | "sms" | "email" | "rcs",
  "reasoning": string,
  "assumptions": string[]       // ANY interpretation you had to make. Empty array if none.
}

QUERY (use when the marketer wants to SEE, LIST, or COUNT customers — not send a campaign. Signals: "show", "list", "who", "how many", "find", "which customers"):
{
  "kind": "query",
  "intent": string,             // short restatement, e.g. "Customers in Mumbai who spent over ₹5000"
  "rules": Rule
}

CLARIFICATION (use when genuinely ambiguous, multiple reasonable readings, or needs data you don't have):
{
  "kind": "clarification",
  "question": string,
  "options": string[]           // optional: 2-4 suggested interpretations
}

A Rule is either a Condition or a Group.
Condition: { "field": Field, "op": Operator, "value": string | number | (string|number)[] }
Group:     { "combinator": "and" | "or", "rules": Rule[] }

Field is one of (THESE ARE THE ONLY DATA YOU HAVE):
- "total_spend"            (number, rupees — sum of the customer's orders)
- "order_count"            (number of orders placed)
- "days_since_last_order"  (days since most recent order; high = dormant)
- "city"                   (string; valid: Mumbai, Delhi, Bangalore, Chennai, Hyderabad, Pune, Kolkata, Ahmedabad)
- "signup_source"          (string; one of: organic, ads, referral)

Operator is one of: "eq", "neq", "gt", "gte", "lt", "lte", "in".
Use "in" with an array value when matching multiple options.

RULES FOR CHOOSING A SHAPE:
- If the marketer wants to VIEW, LIST, COUNT, or EXPLORE customers (not launch a campaign), return a QUERY with the matching rules — do NOT invent a message or channel.
- If they want to REACH or MESSAGE customers, return a PROPOSAL. If it's genuinely ambiguous which of the two they want, prefer QUERY (viewing is safer than proposing a send).
- If you can proceed but had to choose a threshold or interpret a fuzzy term ("best", "recently"), PROCEED but record every choice in "assumptions" (for a proposal) so the marketer can adjust it.
- If the request has genuinely different reasonable readings, return a CLARIFICATION with options rather than silently picking one. But once the marketer has answered a clarification, do NOT ask again — proceed.
- If the request needs data you do NOT have (social media, reviews, support tickets, age), return a CLARIFICATION explaining you can only segment on purchase behaviour, spend, recency, city, and signup source — and suggest a related angle you CAN do.

Mapping guidance:
- "dormant" / "haven't ordered recently" → days_since_last_order gt (e.g. 60).
- "high spenders" / "VIP" → total_spend gt (e.g. 5000).
- "loyal" / "frequent" → order_count gte (e.g. 5).
- "new" / "first-timers" → order_count lte 1.
- Channel: WhatsApp for rich re-engagement, SMS for urgent/short, email for detailed offers.
- Keep messages natural, on-brand, with a clear CTA and a personalization token.`;

function extractJson(text: string): string {
  return text
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();
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
          text: "Understood. I will respond with only the JSON object, in one of the three allowed shapes, using the full conversation context.",
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
  const result = await model.generateContent({
    contents: buildContents(messages, correction),
    generationConfig: {
      temperature: 0.7,
      responseMimeType: "application/json",
    },
  });
  return result.response.text();
}

export async function generateProposal(
  messages: ChatMessage[],
): Promise<AiResponse> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await callGemini(
      messages,
      attempt === 2
        ? "(Your previous response was invalid JSON or didn't match any allowed shape. Respond with ONLY the valid JSON object.)"
        : undefined,
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
    }
  }

  throw new Error(
    `AI could not produce a valid response. ${lastError instanceof Error ? lastError.message : ""}`,
  );
}
