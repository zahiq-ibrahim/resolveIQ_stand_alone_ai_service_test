import { pool } from "../database/pool.js";
import { getEmbedder } from "../providers/registry.js";

export interface SimilarTicket {
  id: string;
  subject: string;
  category: string | null;
  sentiment: string | null;
  score: number;
}

/**
 * Find tickets similar to the given ticket within the same organization.
 * Embeds subject + body, stores the embedding on the ticket, then queries
 * by cosine similarity excluding the source ticket.
 */
export async function findSimilarTickets(
  ticketId: string,
  organizationId: string,
  topK = 5,
): Promise<SimilarTicket[]> {
  // Fetch the ticket
  const { rows: ticketRows } = await pool.query<{
    subject: string;
    body: string;
  }>("SELECT subject, body FROM tickets WHERE id = $1 AND organization_id = $2", [
    ticketId,
    organizationId,
  ]);

  const ticket = ticketRows[0];
  if (!ticket) return [];

  const embedder = getEmbedder();
  const embedding = await embedder.embedQuery(`${ticket.subject}\n${ticket.body}`);
  const vec = `[${embedding.join(",")}]`;

  // Store embedding on this ticket for future similarity lookups
  await pool.query(
    "UPDATE tickets SET embedding = $2::vector WHERE id = $1",
    [ticketId, vec],
  );

  // Cosine similarity search — org-scoped, self-excluded
  const { rows } = await pool.query<{
    id: string;
    subject: string;
    category: string | null;
    sentiment: string | null;
    score: string;
  }>(
    `SELECT id, subject, category, sentiment,
            (1 - (embedding <=> $1::vector))::float8 AS score
     FROM tickets
     WHERE organization_id = $2
       AND id <> $3
       AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $4`,
    [vec, organizationId, ticketId, topK],
  );

  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    category: r.category,
    sentiment: r.sentiment,
    score: Number(r.score),
  }));
}
