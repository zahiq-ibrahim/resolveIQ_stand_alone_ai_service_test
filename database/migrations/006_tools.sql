-- ─── Tool registry ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_tools (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                  TEXT        NOT NULL,
  description           TEXT        NOT NULL DEFAULT '',
  parameters            JSONB       NOT NULL,
  endpoint_url          TEXT,
  requires_confirmation BOOLEAN     NOT NULL DEFAULT false,
  enabled               BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

-- ─── Tool invocation audit log ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_invocations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL,
  tool_id         UUID        NOT NULL REFERENCES ai_tools(id) ON DELETE CASCADE,
  args            JSONB,
  result          JSONB,
  error           TEXT,
  status          TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','awaiting_confirmation','running',
                                      'succeeded','failed','rejected')),
  latency_ms      INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS tool_invocations_org_idx
  ON tool_invocations (organization_id);

CREATE INDEX IF NOT EXISTS tool_invocations_tool_idx
  ON tool_invocations (tool_id);
