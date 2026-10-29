import type { FastifyInstance } from "fastify";
import { getMetrics } from "../../../database/metrics.js";

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (request, reply) => {
    const query = request.query as { organizationId?: string };
    const metrics = await getMetrics(query.organizationId);
    return reply.send(metrics);
  });
}
