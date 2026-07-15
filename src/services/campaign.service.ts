import { prisma } from "../config/db.js";

export async function listCampaigns(userId: string) {
  return prisma.campaign.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      dataset: { select: { name: true } },
      _count: { select: { communications: true } },
    },
  });
}

export async function getCampaign(id: string, userId: string) {
  return prisma.campaign.findFirst({
    where: { id, userId },
    include: { dataset: { select: { name: true } } },
  });
}
