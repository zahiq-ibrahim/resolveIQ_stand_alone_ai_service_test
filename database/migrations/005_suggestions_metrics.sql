-- ─── AI Suggestions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_suggestions (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID          NOT NULL,
  ticket_id           UUID,
  conversation_id     UUID,
  kind                TEXT          NOT NULL
                        CHECK (kind IN ('draft_reply','answer','summary')),
  content             TEXT          NOT NULL,
  citations           JSONB         NOT NULL DEFAULT '[]',
  groundedness_score  NUMERIC(4,3),
  status              TEXT          NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','accepted','edited','rejected','blocked')),
  model               TEXT,
  latency_ms          INT,
  input_tokens        INT,
  output_tokens       INT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  decided_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ai_suggestions_ticket_idx
  ON ai_suggestions (ticket_id);

CREATE INDEX IF NOT EXISTS ai_suggestions_org_idx
  ON ai_suggestions (organization_id);

-- ─── AI Metrics (telemetry) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_metrics (
  id              BIGSERIAL     PRIMARY KEY,
  organization_id UUID,
  provider        TEXT          NOT NULL,
  model           TEXT          NOT NULL,
  operation       TEXT          NOT NULL,
  latency_ms      INT           NOT NULL DEFAULT 0,
  input_tokens    INT           NOT NULL DEFAULT 0,
  output_tokens   INT           NOT NULL DEFAULT 0,
  cost_usd        NUMERIC(10,6) NOT NULL DEFAULT 0,
  success         BOOLEAN       NOT NULL DEFAULT true,
  error           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_metrics_created_idx
  ON ai_metrics (created_at);

CREATE INDEX IF NOT EXISTS ai_metrics_org_idx
  ON ai_metrics (organization_id);
