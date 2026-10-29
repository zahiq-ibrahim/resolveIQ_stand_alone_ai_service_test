import { Queue } from "bullmq";
import { Redis } from "ioredis";

export const connection = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export interface IngestionJobData {
  documentId: string;
  organizationId: string;
  reindex?: boolean;
}

export const ingestionQueue = new Queue<IngestionJobData>("ingestion", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  },
});
