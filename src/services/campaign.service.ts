import { prisma } from "../config/db.js";
import { evaluateSegment } from "./segment.service.js";
import { renderTemplate } from "../utils/template.js";
import { sendQueue } from "../queue/send.queue.js";
import type { Rule } from "../types/segment.types.js";

type Channel = "whatsapp" | "sms" | "email" | "rcs";

interface LaunchParams {
  name: string;
  segmentId: string;
  channel: Channel;
  messageTemplate: string;
}

export async function launchCampaign({
  name,
  segmentId,
  channel,
  messageTemplate,
}: LaunchParams) {
  const segment = await prisma.segment.findUnique({ where: { id: segmentId } });
  if (!segment) throw new Error("Segment not found");

  const audience = await evaluateSegment(segment.rules as unknown as Rule);
  if (audience.length === 0) {
    throw new Error("Segment matches zero customers — nothing to send");
  }

  // Create the campaign in "launching" state.
  const campaign = await prisma.campaign.create({
    data: { name, segmentId, channel, messageTemplate, status: "launching" },
  });

  // Materialize one communication per matched customer, message pre-rendered.
  const commData = audience.map((c) => ({
    campaignId: campaign.id,
    customerId: c.id,
    channel,
    renderedMessage: renderTemplate(messageTemplate, {
      name: c.name,
      city: c.city,
    }),
    status: "queued" as const,
  }));

  await prisma.communication.createMany({ data: commData });

  // Fetch them back to get their generated ids (createMany doesn't return rows).
  const comms = await prisma.communication.findMany({
    where: { campaignId: campaign.id },
    select: { id: true, renderedMessage: true, customerId: true },
  });

  // Map customerId → recipient (email/phone) for the channel payload.
  const recipientById = new Map(audience.map((c) => [c.id, c.email]));

  // Enqueue a send job per communication. Bulk-add for efficiency.
  await sendQueue.addBulk(
    comms.map((comm) => ({
      name: "send",
      data: {
        communicationId: comm.id,
        recipient: recipientById.get(comm.customerId) ?? "unknown",
        channel,
        message: comm.renderedMessage,
      },
    })),
  );

  // Flip to "sent" — the campaign has been fully dispatched to the queue.
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: "sent" },
  });

  return { campaignId: campaign.id, audienceSize: audience.length };
}

export async function listCampaigns() {
  return prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      segment: { select: { name: true } },
      _count: { select: { communications: true } },
    },
  });
}

export async function getCampaign(id: string) {
  return prisma.campaign.findUnique({
    where: { id },
    include: { segment: true },
  });
}
