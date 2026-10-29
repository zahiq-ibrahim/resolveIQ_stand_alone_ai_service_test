-- ─── Conversation sessions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL,
  ticket_id       UUID,
  summary         TEXT        NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_org_idx
  ON conversations (organization_id);

CREATE INDEX IF NOT EXISTS conversations_ticket_idx
  ON conversations (ticket_id);

-- ─── Individual messages within a conversation ────────────────────────────────
CREATE TABLE IF NOT EXISTS conversation_messages (
  id              BIGSERIAL   PRIMARY KEY,
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT        NOT NULL
                    CHECK (role IN ('user','assistant','tool')),
  content         TEXT        NOT NULL,
  citations       JSONB       NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversation_messages_conv_idx
  ON conversation_messages (conversation_id);
