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

// Query now carries the SQL directly — one AI call does classify + generate.
const querySchema = z.object({
  kind: z.literal("query"),
  intent: z.string().min(1),
  sql: z.string().min(1),
});

const responseSchema = z.discriminatedUnion("kind", [
  proposalSchema,
  clarificationSchema,
  querySchema,
]);

export type CustomerQuery = z.infer<typeof querySchema>;
export type CampaignProposal = z.infer<typeof proposalSchema> & { rules: Rule };
export type Clarification = z.infer<typeof clarificationSchema>;
export type AiResponse = CampaignProposal | Clarification | CustomerQuery;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are the assistant inside a marketing CRM. Across a conversation, the marketer either (a) builds campaigns, or (b) asks questions about the customer data. You respond with ONE JSON object per turn.

You MUST respond with ONLY a valid JSON object (no markdown, no backticks, no commentary), in ONE of these three shapes:

PROPOSAL — the marketer wants to REACH/MESSAGE customers (launch a campaign):
{
  "kind": "proposal",
  "segmentName": string,
  "rules": Rule,
  "message": string,            // use {{name}} and {{city}} tokens where natural
  "channel": "whatsapp" | "sms" | "email" | "rcs",
  "reasoning": string,
  "assumptions": string[]
}

QUERY — the marketer wants to SEE, LIST, COUNT, FIND, or ASK ABOUT customer data (including follow-ups about previously shown results):
{
  "kind": "query",
  "intent": string,             // short restatement, e.g. "Check if a customer named Jazmin is in the Mumbai list"
  "sql": string                 // ONE PostgreSQL SELECT that answers it (schema below)
}

CLARIFICATION — genuinely ambiguous, or impossible with the available data:
{
  "kind": "clarification",
  "question": string,
  "options": string[]
}

============ DATABASE SCHEMA (for QUERY sql) ============
All identifiers are lowercase snake_case. NEVER use double quotes around identifiers.

Table customers:
  id, name, email, phone (nullable), city (nullable: Mumbai, Delhi, Bangalore, Chennai, Hyderabad, Pune, Kolkata, Ahmedabad),
  attributes jsonb (may contain {"signupSource": "organic"|"ads"|"referral"}), created_at timestamp

Table orders:
  id, customer_id (FK -> customers.id), amount numeric, ordered_at timestamp

JOIN EXAMPLE (follow this exact style):
  SELECT c.id, c.name, c.email, c.city, SUM(o.amount) AS total_spend
  FROM customers c
  JOIN orders o ON o.customer_id = c.id
  WHERE c.city ILIKE 'Mumbai'
  GROUP BY c.id, c.name, c.email, c.city
  HAVING SUM(o.amount) > 5000

Derived metrics: total spend = SUM(o.amount); order count = COUNT(o.id); days since last order = EXTRACT(DAY FROM now() - MAX(o.ordered_at)).
Signup source: attributes->>'signupSource'. Use ILIKE for text matching. Max 100 rows.

============ CONVERSATION RULES ============
- You NEVER see the actual rows of previous results — only the conversation. When the marketer refers to "your list", "these", "those", "the table", they mean the customers matched by the MOST RECENT query. Answer by writing a NEW sql that RE-APPLIES those same filters plus the new condition. Example: after "customers in Mumbai over 5000", the question "is there a name called Jazmin in your list" becomes sql filtering city ILIKE 'Mumbai', HAVING SUM > 5000, AND name ILIKE '%jazmin%'.
- Questions ABOUT data — "is there…", "how many…", "which of these…", "who is the top…", "does the list have…" — are ALWAYS a QUERY, never a conversational answer.
- For "total"/"sum"/"average"/"count" follow-ups, return the aggregate, not the full list.
- QUERY sql can use ANY column (name, email, phone, …). PROPOSAL rules may ONLY use: total_spend, order_count, days_since_last_order, city, signup_source. If a campaign needs other data, return a CLARIFICATION.
- If a proposal needed threshold choices ("best", "recently"), proceed and record them in "assumptions". If genuinely ambiguous between readings, CLARIFICATION with options — but never re-ask after they've answered.

Mapping guidance (proposals): "dormant" → days_since_last_order gt 60; "high spenders"/"VIP" → total_spend gt 5000; "loyal" → order_count gte 5; "new" → order_count lte 1. WhatsApp for rich re-engagement, SMS for urgent/short, email for detailed offers. Messages: natural, clear CTA, a personalization token.

A Rule is either:
Condition: { "field": Field, "op": "eq"|"neq"|"gt"|"gte"|"lt"|"lte"|"in", "value": string | number | array }
Group: { "combinator": "and" | "or", "rules": Rule[] }

Field is one of:
- "total_spend", "order_count", "days_since_last_order", "city", "signup_source"
- "name", "email"  (use op "contains" for partial, case-insensitive matching — e.g. target a specific customer: { "field": "name", "op": "contains", "value": "jazmin" })`;

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
  for (let i = 0; i <= 2; i++) {
    try {
      const result = await model.generateContent({
        contents: buildContents(messages, correction),
        generationConfig: {
          temperature: 0.3,
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

  for (let attempt = 1; attempt <= 2; attempt++) {
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

export const generateProposal = generateResponse;
