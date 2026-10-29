-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tickets
CREATE TABLE IF NOT EXISTS tickets (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subject         TEXT        NOT NULL,
  body            TEXT        NOT NULL,
  customer_tier   TEXT        NOT NULL DEFAULT 'standard',
  status          TEXT        NOT NULL DEFAULT 'open',
  category        TEXT,
  sentiment       TEXT,
  priority        TEXT,
  summary         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tickets_org_idx ON tickets (organization_id);
