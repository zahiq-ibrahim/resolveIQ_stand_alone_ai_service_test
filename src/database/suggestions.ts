import { pool } from "./pool.js";

export interface AiSuggestion {
  id: string;
  organizationId: string;
  ticketId: string | null;
  conversationId: string | null;
  kind: "draft_reply" | "answer" | "summary";
  content: string;
  citations: unknown[];
  groundednessScore: number | null;
  status: "pending" | "accepted" | "edited" | "rejected" | "blocked";
  model: string | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: Date;
  decidedAt: Date | null;
}

export async function createSuggestion(opts: {
  organizationId: string;
  ticketId?: string;
  conversationId?: string;
  kind: "draft_reply" | "answer" | "summary";
  content: string;
  citations?: unknown[];
  groundednessScore?: number;
  status?: "pending" | "blocked";
  model?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
}): Promise<AiSuggestion> {
  const { rows } = await pool.query<{ id: string; created_at: Date }>(
    `INSERT INTO ai_suggestions
       (organization_id, ticket_id, conversation_id, kind, content,
        citations, groundedness_score, status, model,
        latency_ms, input_tokens, output_tokens)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id, created_at`,
    [
      opts.organizationId,
      opts.ticketId ?? null,
      opts.conversationId ?? null,
      opts.kind,
      opts.content,
      JSON.stringify(opts.citations ?? []),
      opts.groundednessScore ?? null,
      opts.status ?? "pending",
      opts.model ?? null,
      opts.latencyMs ?? null,
      opts.inputTokens ?? null,
      opts.outputTokens ?? null,
    ],
  );

  const row = rows[0]!;
  return {
    id: row.id,
    organizationId: opts.organizationId,
    ticketId: opts.ticketId ?? null,
    conversationId: opts.conversationId ?? null,
    kind: opts.kind,
    content: opts.content,
    citations: opts.citations ?? [],
    groundednessScore: opts.groundednessScore ?? null,
    status: opts.status ?? "pending",
    model: opts.model ?? null,
    latencyMs: opts.latencyMs ?? null,
    inputTokens: opts.inputTokens ?? null,
    outputTokens: opts.outputTokens ?? null,
    createdAt: row.created_at,
    decidedAt: null,
  };
}

export async function getSuggestion(id: string): Promise<AiSuggestion | null> {
  const { rows } = await pool.query<{
    id: string;
    organization_id: string;
    ticket_id: string | null;
    conversation_id: string | null;
    kind: "draft_reply" | "answer" | "summary";
    content: string;
    citations: unknown[];
    groundedness_score: string | null;
    status: "pending" | "accepted" | "edited" | "rejected" | "blocked";
    model: string | null;
    latency_ms: number | null;
    input_tokens: number | null;
    output_tokens: number | null;
    created_at: Date;
    decided_at: Date | null;
  }>("SELECT * FROM ai_suggestions WHERE id = $1", [id]);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    organizationId: row.organization_id,
    ticketId: row.ticket_id,
    conversationId: row.conversation_id,
    kind: row.kind,
    content: row.content,
    citations: row.citations,
    groundednessScore: row.groundedness_score !== null ? Number(row.groundedness_score) : null,
    status: row.status,
    model: row.model,
    latencyMs: row.latency_ms,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

export async function decideSuggestion(
  id: string,
  decision: "accepted" | "edited" | "rejected",
  editedContent?: string,
): Promise<void> {
  await pool.query(
    `UPDATE ai_suggestions
     SET status = $2,
         content = COALESCE($3, content),
         decided_at = now()
     WHERE id = $1`,
    [id, decision, editedContent ?? null],
  );
}
