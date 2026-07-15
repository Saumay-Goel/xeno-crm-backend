import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env.js";
import { z } from "zod";
import type { ChatMessage } from "./ai.service.js";
import type { ContactCandidate } from "./dataset.service.js";

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const detailsSchema = z.object({
  segmentName: z.string().min(1),
  contactColumn: z.string().min(1),
  channel: z.enum(["whatsapp", "sms", "email", "rcs"]),
  message: z.string().min(1),
  reasoning: z.string(),
  assumptions: z.array(z.string()).default([]),
});

export type CampaignDetails = z.infer<typeof detailsSchema>;

interface Column {
  name: string;
  key: string;
  type: string;
  sampleValues: string[];
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

export async function generateCampaignDetails(
  messages: ChatMessage[],
  datasetName: string,
  columns: Column[],
  contacts: ContactCandidate[],
): Promise<CampaignDetails> {
  const colList = columns.map((c) => `${c.key} (${c.type})`).join(", ");
  const contactList =
    contacts.map((c) => `${c.key} (${c.kind})`).join(", ") || "none detected";

  const prompt = `You are a marketing campaign assistant. The user wants to send a campaign to rows of their dataset "${datasetName}". Your ONLY job is to choose the contact column, channel, and write the message. You do NOT write SQL or define the audience — that is handled separately.

DATASET COLUMNS: ${colList}
DETECTED CONTACT COLUMNS (recipient addresses): ${contactList}

Respond with ONLY a JSON object:
{
  "segmentName": string,        // short human label for this audience, e.g. "Customers in Ecuador"
  "contactColumn": string,      // which column key to message — MUST be one of the detected contact columns
  "channel": "whatsapp" | "sms" | "email" | "rcs",
  "message": string,            // the message, using {{column_key}} tokens for personalization
  "reasoning": string,
  "assumptions": string[]       // every choice you had to infer
}

RULES:
- contactColumn MUST be one of the detected contact columns above. Prefer an email column for professional outreach; use a phone column only if no email exists or the user asks.
- Channel MUST match the contact type: if contactColumn is an EMAIL column, channel MUST be "email". If it's a PHONE column, channel must be "whatsapp" or "sms" (prefer whatsapp for rich messages, sms for short/urgent).
- Personalize the message using {{column_key}} tokens from the DATASET COLUMNS — e.g. {{first_name}}, {{company}}, {{city}}. Only use column keys that actually exist above.
- Record EVERY inference in "assumptions" — which contact column you picked and why, the channel choice, any audience interpretation.
- Keep the message natural, on-brand, with a clear CTA.`;

  for (let i = 0; i <= 2; i++) {
    try {
      const result = await model.generateContent({
        contents: [
          { role: "user", parts: [{ text: prompt }] },
          {
            role: "model",
            parts: [
              {
                text: "Understood. I will return only the JSON object with a valid contact column and matching channel.",
              },
            ],
          },
          ...messages.map((m) => ({
            role: (m.role === "assistant" ? "model" : "user") as
              | "user"
              | "model",
            parts: [{ text: m.content }],
          })),
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
        },
      });

      const raw = result.response
        .text()
        .replace(/```json\s*/gi, "")
        .replace(/```/g, "")
        .trim();
      const parsed = detailsSchema.parse(JSON.parse(raw));

      const validContact = contacts.find((c) => c.key === parsed.contactColumn);
      if (!validContact) {
        throw new Error(
          `AI picked contactColumn "${parsed.contactColumn}" which isn't a detected contact column`,
        );
      }
      if (validContact.kind === "email" && parsed.channel !== "email") {
        parsed.channel = "email";
      }
      if (validContact.kind === "phone" && parsed.channel === "email") {
        parsed.channel = "whatsapp";
      }

      return parsed;
    } catch (err) {
      if (isOverloaded(err) && i < 2) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      if (i === 2) throw err;
    }
  }
  throw new Error("Could not generate campaign details");
}
