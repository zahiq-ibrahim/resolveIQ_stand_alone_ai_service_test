import type { FastifyInstance } from "fastify";
import { pool } from "../../../database/pool.js";

export async function organizationsRoutes(app: FastifyInstance): Promise<void> {
  app.post("/", async (request, reply) => {
    const body = request.body as { name?: unknown };
    const name = String(body.name ?? "").trim();
    if (!name) {
      return reply.status(400).send({ error: "name is required" });
    }

    const { rows } = await pool.query<{ id: string }>(
      "INSERT INTO organizations (name) VALUES ($1) RETURNING id",
      [name],
    );
    return reply.status(201).send({ id: rows[0]!.id, name });
  });
}
