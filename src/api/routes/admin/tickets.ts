import type { FastifyInstance } from "fastify";
import { pool } from "../../../database/pool.js";
import { classifyTicket } from "../../../classify-ticket.js";
import { findSimilarTickets } from "../../../rag/similar-tickets.js";

export async function ticketsRoutes(app: FastifyInstance): Promise<void> {
  // POST /admin/tickets
  app.post("/", async (request, reply) => {
    const body = request.body as {
      organizationId?: unknown;
      subject?: unknown;
      body?: unknown;
      customerTier?: unknown;
    };

    const organizationId = String(body.organizationId ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const ticketBody = String(body.body ?? "").trim();
    const customerTier = String(body.customerTier ?? "standard").trim();

    if (!organizationId) return reply.status(400).send({ error: "organizationId required" });
    if (!subject) return reply.status(400).send({ error: "subject required" });
    if (!ticketBody) return reply.status(400).send({ error: "body required" });

    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO tickets (organization_id, subject, body, customer_tier)
       VALUES ($1,$2,$3,$4)
       RETURNING id`,
      [organizationId, subject, ticketBody, customerTier],
    );

    return reply.status(201).send({ id: rows[0]!.id });
  });

  // POST /admin/tickets/:id/classify
  app.post<{ Params: { id: string } }>("/:id/classify", async (request, reply) => {
    const { rows } = await pool.query<{ subject: string; body: string }>(
      "SELECT subject, body FROM tickets WHERE id = $1",
      [request.params.id],
    );

    const ticket = rows[0];
    if (!ticket) return reply.status(404).send({ error: "Ticket not found" });

    const classification = await classifyTicket(
      `Subject: ${ticket.subject}\n\n${ticket.body}`,
    );

    await pool.query(
      `UPDATE tickets
       SET category = $2, sentiment = $3, priority = $4, summary = $5
       WHERE id = $1`,
      [
        request.params.id,
        classification.category,
        classification.sentiment,
        classification.priority,
        classification.summary,
      ],
    );

    return reply.send(classification);
  });

  // GET /admin/tickets/:id/similar
  app.get<{ Params: { id: string }; Querystring: { organizationId?: string } }>(
    "/:id/similar",
    async (request, reply) => {
      const { rows } = await pool.query<{ organization_id: string }>(
        "SELECT organization_id FROM tickets WHERE id = $1",
        [request.params.id],
      );

      const ticket = rows[0];
      if (!ticket) return reply.status(404).send({ error: "Ticket not found" });

      const similar = await findSimilarTickets(
        request.params.id,
        ticket.organization_id,
      );
      return reply.send(similar);
    },
  );
}
