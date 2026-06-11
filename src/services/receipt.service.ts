import { prisma } from "../config/db.js";

export type ChannelEvent =
  | "delivered"
  | "failed"
  | "opened"
  | "read"
  | "clicked"
  | "converted";

const STATUS_RANK: Record<string, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  failed: 2,
  opened: 3,
  read: 4,
  clicked: 5,
  converted: 6,
};

const EVENT_TIMESTAMP: Record<ChannelEvent, string> = {
  delivered: "deliveredAt",
  failed: "failedAt",
  opened: "openedAt",
  read: "readAt",
  clicked: "clickedAt",
  converted: "convertedAt",
};

export async function ingestReceipt(
  communicationId: string,
  event: ChannelEvent,
  occurredAt: string,
) {
  const comm = await prisma.communication.findUnique({
    where: { id: communicationId },
  });
  if (!comm) {
    return { applied: false, reason: "unknown_communication" };
  }

  const existing = await prisma.receipt.findFirst({
    where: { communicationId, eventType: event },
  });
  if (existing) {
    return { applied: false, reason: "duplicate" };
  }

  await prisma.receipt.create({
    data: {
      communicationId,
      eventType: event,
      payload: { occurredAt },
    },
  });

  const currentRank = STATUS_RANK[comm.status] ?? 0;
  const incomingRank = STATUS_RANK[event] ?? 0;
  if (incomingRank <= currentRank) {
    return { applied: false, reason: "out_of_order_or_stale", recorded: true };
  }

  const tsColumn = EVENT_TIMESTAMP[event];
  await prisma.communication.update({
    where: { id: communicationId },
    data: {
      status: event,
      [tsColumn]: new Date(occurredAt),
    },
  });

  return { applied: true, status: event };
}
