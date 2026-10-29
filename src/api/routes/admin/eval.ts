import type { FastifyInstance } from "fastify";
import { pool } from "../../../database/pool.js";

export async function evalRoutes(app: FastifyInstance): Promise<void> {
  // POST /admin/eval/run — triggers the eval runner programmatically
  app.post<{ Body: { limit?: number; org?: string } }>("/run", async (request, reply) => {
    // The eval runner is a CLI tool; here we return a stub
    // In production this would enqueue a background eval job
    return reply.status(202).send({
      message: "Eval triggered. Run `npm run eval` for full report.",
    });
  });

  // GET /admin/eval/runs/:id
  app.get<{ Params: { id: string } }>("runs/:id", async (request, reply) => {
    const { rows } = await pool.query<{
      id: string;
      created_at: Date;
      case_count: number;
      metrics: unknown;
      report_md: string;
    }>("SELECT * FROM eval_runs WHERE id = $1", [request.params.id]);

    const row = rows[0];
    if (!row) return reply.status(404).send({ error: "Eval run not found" });
    return reply.send(row);
  });
}
