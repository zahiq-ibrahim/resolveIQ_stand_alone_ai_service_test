import "dotenv/config";
import { Worker } from "bullmq";
import { connection, ingestionQueue } from "./queues.js";
import { processIngestion } from "./processors/ingest-document.js";
import { requeueStuckDocuments } from "../database/documents.js";
import { pool } from "../database/pool.js";

// ─── Startup sweep: re-queue documents stuck in 'processing' ─────────────────
async function startupSweep(): Promise<void> {
  try {
    const stuck = await requeueStuckDocuments(15);
    if (stuck.length > 0) {
      console.log(`[worker] Re-queued ${stuck.length} stuck document(s): ${stuck.join(", ")}`);
      for (const id of stuck) {
        await ingestionQueue.add("ingest", { documentId: id, organizationId: "", reindex: false });
      }
    }
  } catch (err) {
    console.error("[worker] Startup sweep failed:", err);
  }
}

// ─── BullMQ worker ────────────────────────────────────────────────────────────
const worker = new Worker("ingestion", processIngestion, {
  connection,
  concurrency: 4,
  lockDuration: 120_000,
});

worker.on("completed", (job) => {
  console.log(`[worker] Job ${job.id} completed (document: ${job.data.documentId})`);
});

worker.on("failed", (job, err) => {
  console.error(
    `[worker] Job ${job?.id} failed (document: ${job?.data.documentId}): ${err.message}`,
  );
});

worker.on("error", (err) => {
  console.error("[worker] Worker error:", err);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(): Promise<void> {
  console.log("[worker] Shutting down…");
  await worker.close();
  await pool.end();
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

// Start
await startupSweep();
console.log("[worker] Ready. Listening for ingestion jobs.");
