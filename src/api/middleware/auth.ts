import type { FastifyRequest, FastifyReply } from "fastify";
import { env } from "../../config/env.js";

/**
 * Admin API key guard.
 * All routes under /admin must present: x-admin-key: <ADMIN_API_KEY>
 */
export async function adminAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const key = request.headers["x-admin-key"];
  if (!key || key !== env.ADMIN_API_KEY) {
    await reply.status(401).send({ error: "Unauthorized" });
  }
}
