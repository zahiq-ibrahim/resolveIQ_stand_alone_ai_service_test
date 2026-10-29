import type { FastifyInstance } from "fastify";
import { draftReply } from "../../../rag/draft-reply.js";
import { getSuggestion, decideSuggestion } from "../../../database/suggestions.js";

export async function draftsRoutes(app: FastifyInstance): Promise<void> {
  // POST /admin/draft
  app.post("/", async (request, reply) => {
    const body = request.body as {
      ticketId?: unknown;
      conversationId?: unknown;
    };

    const ticketId = String(body.ticketId ?? "").trim();
    if (!ticketId) return reply.status(400).send({ error: "ticketId required" });

    // Look up org from ticket
    const { pool } = await import("../../../database/pool.js");
    const { rows } = await pool.query<{ organization_id: string }>(
      "SELECT organization_id FROM tickets WHERE id = $1",
      [ticketId],
    );

    if (!rows[0]) return reply.status(404).send({ error: "Ticket not found" });
    const organizationId = rows[0].organization_id;

    const result = await draftReply({
      ticketId,
      organizationId,
      ...(body.conversationId ? { conversationId: String(body.conversationId) } : {}),
    });

    return reply.send(result);
  });

  // POST /admin/suggestions/:id/decision
  app.post<{ Params: { id: string } }>(
    "/suggestions/:id/decision",
    async (request, reply) => {
      const body = request.body as {
        decision?: unknown;
        editedContent?: unknown;
      };

      const decision = String(body.decision ?? "").trim();
      if (!["accepted", "edited", "rejected"].includes(decision)) {
        return reply
          .status(400)
          .send({ error: "decision must be accepted | edited | rejected" });
      }

      const suggestion = await getSuggestion(request.params.id);
      if (!suggestion) return reply.status(404).send({ error: "Suggestion not found" });
      if (suggestion.status !== "pending") {
        return reply.status(409).send({ error: "Suggestion already decided" });
      }

      await decideSuggestion(
        request.params.id,
        decision as "accepted" | "edited" | "rejected",
        body.editedContent ? String(body.editedContent) : undefined,
      );

      return reply.send({ id: request.params.id, status: decision });
    },
  );
}
