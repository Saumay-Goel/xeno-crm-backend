import { prisma } from "../config/db.js";

export async function getCampaignFunnel(campaignId: string, userId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId },
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

export async function getDashboardStats(userId: string) {
  const [customerCount, orderAgg, campaignCount, commStats, recentCampaigns] =
    await Promise.all([
      prisma.customer.count(),
      prisma.order.aggregate({ _sum: { amount: true } }),
      prisma.campaign.count({ where: { userId } }),
      prisma.communication.findMany({
        where: { campaign: { userId } },
        select: {
          sentAt: true,
          deliveredAt: true,
          openedAt: true,
          convertedAt: true,
        },
      }),
      prisma.campaign.findMany({
        where: { userId },
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          segment: { select: { name: true } },
          _count: { select: { communications: true } },
        },
      }),
    ]);

  const sent = commStats.filter((c) => c.sentAt).length;
  const delivered = commStats.filter((c) => c.deliveredAt).length;
  const opened = commStats.filter((c) => c.openedAt).length;
  const converted = commStats.filter((c) => c.convertedAt).length;

  return {
    customers: customerCount,
    totalRevenue: Number(orderAgg._sum.amount ?? 0),
    campaigns: campaignCount,
    messaging: {
      sent,
      delivered,
      opened,
      converted,
      deliveryRate: sent ? Math.round((delivered / sent) * 100) : 0,
      openRate: delivered ? Math.round((opened / delivered) * 100) : 0,
    },
    recentCampaigns: recentCampaigns.map((c) => ({
      id: c.id,
      name: c.name,
      channel: c.channel,
      segmentName: c.segment.name,
      audience: c._count.communications,
      createdAt: c.createdAt,
    })),
  };
}
