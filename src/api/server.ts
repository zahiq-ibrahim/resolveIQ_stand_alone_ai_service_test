import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { env } from "../config/env.js";
import { adminAuth } from "./middleware/auth.js";
import { organizationsRoutes } from "./routes/admin/organizations.js";
import { documentsRoutes } from "./routes/admin/documents.js";
import { toolsRoutes } from "./routes/admin/tools.js";
import { ticketsRoutes } from "./routes/admin/tickets.js";
import { askRoutes } from "./routes/admin/ask.js";
import { draftsRoutes } from "./routes/admin/drafts.js";
import { evalRoutes } from "./routes/admin/eval.js";
import { metricsRoutes } from "./routes/admin/metrics.js";
import { invocationsRoutes } from "./routes/admin/invocations.js";
import { pool } from "../database/pool.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });

// ─── Health check (public) ────────────────────────────────────────────────────
app.get("/health", async (_request, reply) => {
  return reply.send({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Admin routes (all guarded by x-admin-key) ───────────────────────────────
await app.register(
  async (admin) => {
    admin.addHook("onRequest", adminAuth);

    await admin.register(organizationsRoutes, { prefix: "/organizations" });
    await admin.register(documentsRoutes, { prefix: "/documents" });
    await admin.register(toolsRoutes, { prefix: "/tools" });
    await admin.register(ticketsRoutes, { prefix: "/tickets" });
    await admin.register(askRoutes, { prefix: "/ask" });
    await admin.register(draftsRoutes, { prefix: "/draft" });
    await admin.register(evalRoutes, { prefix: "/eval" });
    await admin.register(metricsRoutes, { prefix: "/metrics" });
    await admin.register(invocationsRoutes, { prefix: "/invocations" });
  },
  { prefix: "/admin" },
);

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(): Promise<void> {
  app.log.info("Shutting down server…");
  await app.close();
  await pool.end();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

// ─── Start ───────────────────────────────────────────────────────────────────
try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
