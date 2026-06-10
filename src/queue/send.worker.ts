import { Worker } from "bullmq";
import { redisConnection } from "./connection.js";
import type { SendJobData } from "./send.queue.js";
import { env } from "../config/env.js";
import { prisma } from "../config/db.js";

const CONCURRENCY = 20;

export const sendWorker = new Worker<SendJobData>(
  "send",
  async (job) => {
    const { communicationId, recipient, channel, message } = job.data;

    const res = await fetch(`${env.CHANNEL_SERVICE_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ communicationId, recipient, channel, message }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Channel service responded ${res.status}`);
    }

    await prisma.communication.update({
      where: { id: communicationId },
      data: { status: "sent", sentAt: new Date() },
    });

    return { communicationId };
  },
  { connection: redisConnection, concurrency: CONCURRENCY },
);

sendWorker.on("completed", (job) => {
  console.log(`[worker] sent ${job.data.communicationId}`);
});
sendWorker.on("failed", (job, err) => {
  console.error(`[worker] failed ${job?.data.communicationId}: ${err.message}`);
});
