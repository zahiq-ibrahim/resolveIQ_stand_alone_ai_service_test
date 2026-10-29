import { pool } from "./pool.js";
import { env } from "../config/env.js";

export interface ScoredChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  chunkText: string;
  chunkIndex: number;
  score: number;
}

/**
 * Reciprocal Rank Fusion (RRF) hybrid search.
 *
 * Combines a vector-cosine (semantic) leg and a tsvector (keyword) leg,
 * fuses their per-document rank lists using the RRF formula, then returns
 * the top `finalLimit` results sorted by fused score.
 *
 * EVERY query is scoped to `organizationId` via a parameterized WHERE clause.
 * User text is NEVER interpolated into SQL.
 */
export async function hybridSearch(p: {
  organizationId: string;
  queryEmbedding: number[];
  queryText: string;
  semanticLimit?: number; // default 50
  keywordLimit?: number; // default 50
  finalLimit?: number; // default 40
}): Promise<ScoredChunk[]> {
  const K = env.HYBRID_RRF_K; // default 60
  const vec = `[${p.queryEmbedding.join(",")}]`;
  const semanticLimit = p.semanticLimit ?? 50;
  const keywordLimit = p.keywordLimit ?? 50;
  const finalLimit = p.finalLimit ?? 40;

  const sql = `
    WITH sem AS (
      SELECT c.id, c.document_id, 1.0 / ($1 + s.rank) AS weight
      FROM (
        SELECT c2.id, c2.document_id,
               row_number() OVER (ORDER BY c2.embedding <=> $2::vector) AS rank
        FROM document_chunks c2
        JOIN documents d ON d.id = c2.document_id
        WHERE d.organization_id = $3
          AND d.status = 'ready'
          AND c2.embedding IS NOT NULL
        ORDER BY c2.embedding <=> $2::vector
        LIMIT $4
      ) s
      JOIN document_chunks c ON c.id = s.id
    ),
    kw AS (
      SELECT c.id, c.document_id, 1.0 / ($1 + k.rank) AS weight
      FROM (
        SELECT c2.id, c2.document_id,
               row_number() OVER (
                 ORDER BY ts_rank(c2.tsv, websearch_to_tsquery('english', $5)) DESC
               ) AS rank
        FROM document_chunks c2
        JOIN documents d ON d.id = c2.document_id
        WHERE d.organization_id = $3
          AND d.status = 'ready'
          AND c2.tsv @@ websearch_to_tsquery('english', $5)
        ORDER BY ts_rank(c2.tsv, websearch_to_tsquery('english', $5)) DESC
        LIMIT $6
      ) k
      JOIN document_chunks c ON c.id = k.id
    ),
    fused AS (
      SELECT id, document_id, SUM(weight) AS rrf_score
      FROM (
        SELECT id, document_id, weight FROM sem
        UNION ALL
        SELECT id, document_id, weight FROM kw
      ) u
      GROUP BY id, document_id
    )
    SELECT
      f.id,
      f.document_id,
      f.rrf_score,
      COALESCE(d.title, d.source_name, '') AS document_title,
      c.chunk_text,
      c.chunk_index
    FROM fused f
    JOIN document_chunks c ON c.id = f.id
    JOIN documents d       ON d.id = f.document_id
    ORDER BY f.rrf_score DESC
    LIMIT $7
  `;

  const { rows } = await pool.query(sql, [
    K,
    vec,
    p.organizationId,
    semanticLimit,
    p.queryText,
    keywordLimit,
    finalLimit,
  ]);

  return rows.map((r) => ({
    id: r.id as string,
    documentId: r.document_id as string,
    documentTitle: r.document_title as string,
    chunkText: r.chunk_text as string,
    chunkIndex: r.chunk_index as number,
    score: Number(r.rrf_score),
  }));
}
