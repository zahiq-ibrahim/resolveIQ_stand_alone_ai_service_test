-- Ticket embeddings for similar-ticket search
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS embedding vector(768);

CREATE INDEX IF NOT EXISTS tickets_embedding_hnsw
  ON tickets USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
