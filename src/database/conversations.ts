import { pool } from "./pool.js";

export interface Conversation {
  id: string;
  organizationId: string;
  ticketId: string | null;
  summary: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationMessage {
  id: number;
  conversationId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  citations: unknown[];
  createdAt: Date;
}

export async function createConversation(opts: {
  organizationId: string;
  ticketId?: string;
}): Promise<Conversation> {
  const { rows } = await pool.query<{
    id: string;
    organization_id: string;
    ticket_id: string | null;
    summary: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `INSERT INTO conversations (organization_id, ticket_id)
     VALUES ($1, $2)
     RETURNING *`,
    [opts.organizationId, opts.ticketId ?? null],
  );
  const row = rows[0]!;
  return {
    id: row.id,
    organizationId: row.organization_id,
    ticketId: row.ticket_id,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const { rows } = await pool.query<{
    id: string;
    organization_id: string;
    ticket_id: string | null;
    summary: string;
    created_at: Date;
    updated_at: Date;
  }>(
    "SELECT * FROM conversations WHERE id = $1",
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    ticketId: row.ticket_id,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getRecentMessages(
  conversationId: string,
  limit = 10,
): Promise<ConversationMessage[]> {
  const { rows } = await pool.query<{
    id: number;
    conversation_id: string;
    role: "user" | "assistant" | "tool";
    content: string;
    citations: unknown[];
    created_at: Date;
  }>(
    `SELECT * FROM conversation_messages
     WHERE conversation_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [conversationId, limit],
  );
  return rows.reverse().map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role,
    content: r.content,
    citations: r.citations,
    createdAt: r.created_at,
  }));
}

export async function appendMessage(opts: {
  conversationId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  citations?: unknown[];
}): Promise<void> {
  await pool.query(
    `INSERT INTO conversation_messages (conversation_id, role, content, citations)
     VALUES ($1,$2,$3,$4)`,
    [opts.conversationId, opts.role, opts.content, JSON.stringify(opts.citations ?? [])],
  );
  await pool.query(
    "UPDATE conversations SET updated_at = now() WHERE id = $1",
    [opts.conversationId],
  );
}

export async function updateConversationSummary(
  conversationId: string,
  summary: string,
): Promise<void> {
  await pool.query(
    "UPDATE conversations SET summary = $2, updated_at = now() WHERE id = $1",
    [conversationId, summary],
  );
}

export async function getMessageCount(conversationId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM conversation_messages WHERE conversation_id = $1",
    [conversationId],
  );
  return Number(rows[0]?.count ?? 0);
}
