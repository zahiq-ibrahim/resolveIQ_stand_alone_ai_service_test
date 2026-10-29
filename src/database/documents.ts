import { pool } from "./pool.js";

export interface DocumentStats {
  id: string;
  title: string;
  sourceName: string;
  status: string;
  attempts: number;
  lastError: string | null;
  chunkCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
}

/** Transition document to 'processing', record start time and increment attempts. */
export async function markProcessing(documentId: string): Promise<void> {
  await pool.query(
    `UPDATE documents
     SET status = 'processing', started_at = now(), attempts = attempts + 1
     WHERE id = $1`,
    [documentId],
  );
}

/** Transition document to 'ready', record completion time. */
export async function markReady(documentId: string): Promise<void> {
  await pool.query(
    `UPDATE documents
     SET status = 'ready', completed_at = now(), last_error = NULL
     WHERE id = $1`,
    [documentId],
  );
}

/** Transition document to 'failed', record the error message. */
export async function markFailed(documentId: string, error: string): Promise<void> {
  await pool.query(
    `UPDATE documents
     SET status = 'failed', last_error = $2
     WHERE id = $1`,
    [documentId, error],
  );
}

/** Return document metadata + chunk count. */
export async function getDocumentWithStats(
  documentId: string,
): Promise<DocumentStats | null> {
  const { rows } = await pool.query<{
    id: string;
    title: string;
    source_name: string;
    status: string;
    attempts: number;
    last_error: string | null;
    started_at: Date | null;
    completed_at: Date | null;
    chunk_count: string;
  }>(
    `SELECT d.id, d.title, d.source_name, d.status, d.attempts,
            d.last_error, d.started_at, d.completed_at,
            COUNT(c.id)::text AS chunk_count
     FROM documents d
     LEFT JOIN document_chunks c ON c.document_id = d.id
     WHERE d.id = $1
     GROUP BY d.id`,
    [documentId],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    sourceName: row.source_name,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    chunkCount: Number(row.chunk_count),
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

/** Re-queue any documents stuck in 'processing' for more than `thresholdMinutes`. */
export async function requeueStuckDocuments(
  thresholdMinutes = 15,
): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `UPDATE documents
     SET status = 'queued', started_at = NULL
     WHERE status = 'processing'
       AND started_at < now() - ($1 || ' minutes')::interval
     RETURNING id`,
    [thresholdMinutes],
  );
  return rows.map((r) => r.id);
}
