import { prisma } from "../config/db.js";
import { readonlyPool } from "../config/readonly-db.js";
import { assertSafeSelect } from "./sql-guard.service.js";
import { sendQueue } from "../queue/send.queue.js";
import { renderTemplate } from "../utils/render-template.js";

type Channel = "whatsapp" | "sms" | "email" | "rcs";

interface LaunchDatasetParams {
  userId: string;
  datasetId: string;
  name: string;
  channel: Channel;
  contactColumn: string;
  messageTemplate: string;
  audienceSql: string;
}

export async function launchDatasetCampaign({
  userId,
  datasetId,
  name,
  channel,
  contactColumn,
  messageTemplate,
  audienceSql,
}: LaunchDatasetParams) {
  const dataset = await prisma.dataset.findFirst({
    where: { id: datasetId, userId },
  });
  if (!dataset) throw new Error("Dataset not found");

  const safe = assertSafeSelect(audienceSql);
  if (!safe.includes(datasetId)) {
    throw new Error("Audience query is not scoped to this dataset");
  }
  const result = await readonlyPool.query(safe);
  const rows = result.rows as Record<string, unknown>[];
  if (rows.length === 0) {
    throw new Error("Audience is empty — nothing to send");
  }

  const campaign = await prisma.campaign.create({
    data: {
      userId,
      name,
      channel,
      messageTemplate,
      status: "launching",
      datasetId,
      contactColumn,
      audienceSql: safe,
    },
  });

  const commData = rows.map((row) => {
    const contact = row[contactColumn];
    return {
      campaignId: campaign.id,
      channel,
      renderedMessage: renderTemplate(messageTemplate, row),
      contact: contact == null ? null : String(contact),
      status: "queued" as const,
    };
  });
  await prisma.communication.createMany({ data: commData });

  const comms = await prisma.communication.findMany({
    where: { campaignId: campaign.id },
    select: { id: true, renderedMessage: true, contact: true },
  });

  await sendQueue.addBulk(
    comms.map((comm) => ({
      name: "send",
      data: {
        communicationId: comm.id,
        recipient: comm.contact ?? "unknown",
        channel,
        message: comm.renderedMessage,
      },
    })),
  );

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: "sent" },
  });

  return { campaignId: campaign.id, audienceSize: rows.length };
}
