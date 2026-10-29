-- ─── HNSW approximate nearest-neighbour index on embeddings ───────────────────
-- Neon supports hnsw; m=16 ef_construction=64 are good defaults for 768-dim vectors.
CREATE INDEX IF NOT EXISTS document_chunks_embedding_hnsw
  ON document_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─── Full-text search column (for the BM25-ish keyword leg of hybrid search) ──
ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(chunk_text, ''))) STORED;

CREATE INDEX IF NOT EXISTS document_chunks_tsv_idx
  ON document_chunks USING gin (tsv);

-- ─── Document lifecycle state machine ─────────────────────────────────────────
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','ready','failed')),
  ADD COLUMN IF NOT EXISTS last_error    TEXT,
  ADD COLUMN IF NOT EXISTS attempts      INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at  TIMESTAMPTZ;

-- Mark any document that already has chunks as 'ready'
UPDATE documents d
SET    status = 'ready'
WHERE  EXISTS (SELECT 1 FROM document_chunks c WHERE c.document_id = d.id)
  AND  d.status = 'queued';
