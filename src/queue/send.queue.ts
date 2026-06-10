import { Queue } from "bullmq";
import { redisConnection } from "./connection.js";

export interface SendJobData {
  communicationId: string;
  recipient: string;
  channel: "whatsapp" | "sms" | "email" | "rcs";
  message: string;
}

export const sendQueue = new Queue<SendJobData>("send", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});
