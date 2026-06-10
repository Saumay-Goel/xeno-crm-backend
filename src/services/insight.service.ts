import { prisma } from "../config/db.js";

export async function getCampaignFunnel(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { segment: { select: { name: true } } },
  });
  if (!campaign) return null;

  const comms = await prisma.communication.findMany({
    where: { campaignId },
    select: {
      status: true,
      sentAt: true,
      deliveredAt: true,
      openedAt: true,
      readAt: true,
      clickedAt: true,
      convertedAt: true,
      failedAt: true,
    },
  });

  const total = comms.length;
  const funnel = {
    total,
    sent: comms.filter((c) => c.sentAt).length,
    delivered: comms.filter((c) => c.deliveredAt).length,
    opened: comms.filter((c) => c.openedAt).length,
    read: comms.filter((c) => c.readAt).length,
    clicked: comms.filter((c) => c.clickedAt).length,
    converted: comms.filter((c) => c.convertedAt).length,
    failed: comms.filter((c) => c.failedAt).length,
  };

  const pending = comms.filter((c) => c.status === "queued").length;

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      channel: campaign.channel,
      status: campaign.status,
      segmentName: campaign.segment.name,
      createdAt: campaign.createdAt,
    },
    funnel,
    pending,
  };
}
