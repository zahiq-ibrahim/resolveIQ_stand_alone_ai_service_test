-- Enable pgvector (Neon supports it natively, including HNSW)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id TEXT        NOT NULL,
    -- human-readable display name / document title
    title           TEXT        NOT NULL DEFAULT '',
    -- kept for backward compat; new code uses `title`
    source_name     TEXT        NOT NULL DEFAULT '',
    content_type    TEXT        NOT NULL,
    -- optional: path on disk used by the worker for file ingestion
    file_path       TEXT,
    -- optional: inline raw text for API-supplied documents
    raw_text        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_chunks (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID        NOT NULL
                        REFERENCES documents(id) ON DELETE CASCADE,
    organization_id TEXT        NOT NULL,
    chunk_index     INTEGER     NOT NULL,
    -- canonical column name used throughout this service
    chunk_text      TEXT        NOT NULL,
    -- backward-compat alias; kept so old queries still compile
    content         TEXT        GENERATED ALWAYS AS (chunk_text) STORED,
    start_char      INTEGER     NOT NULL,
    end_char        INTEGER     NOT NULL,
    embedding       VECTOR(768),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_documents_organization
    ON documents(organization_id);

CREATE INDEX IF NOT EXISTS idx_chunks_organization
    ON document_chunks(organization_id);

CREATE INDEX IF NOT EXISTS idx_chunks_document
    ON document_chunks(document_id);
