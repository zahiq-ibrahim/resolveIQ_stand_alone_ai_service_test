CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_org_source_unique
ON documents (organization_id, source_name);