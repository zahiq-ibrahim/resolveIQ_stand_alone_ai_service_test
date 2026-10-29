import { pool } from "./pool.js";
import { generateEmbedding } from "../embeddings/generate-embedding.js";

export interface SearchResult {
  documentId: string;
  sourceName: string;
  chunkIndex: number;
  content: string;
  similarity: number;
}

export async function searchDocuments(
  query: string,
  organizationId: string,
  topK = 5,
): Promise<SearchResult[]> {
  if (!query.trim()) {
    throw new Error("Search query cannot be empty.");
  }

  if (!organizationId.trim()) {
    throw new Error("organizationId is required.");
  }

  if (!Number.isInteger(topK) || topK < 1 || topK > 20) {
    throw new Error("topK must be an integer between 1 and 20.");
  }

  const embedding = await generateEmbedding(query, "RETRIEVAL_QUERY");

  const result = await pool.query<SearchResult>(
    `
      SELECT
        d.id                                              AS "documentId",
        d.source_name                                     AS "sourceName",
        c.chunk_index                                     AS "chunkIndex",
        c.chunk_text                                      AS content,
        (1 - (c.embedding <=> $1::vector))::float8        AS similarity
      FROM document_chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE c.organization_id = $2
        AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> $1::vector
      LIMIT $3
    `,
    [JSON.stringify(embedding), organizationId, topK],
  );

  return result.rows;
}

/**
 * Kept for backward compatibility with tests that call closeSearchDatabase().
 * The shared pool is managed globally; calling this is now a no-op.
 */
export async function closeSearchDatabase(): Promise<void> {
  // no-op: pool is managed by src/database/pool.ts
}
