import { pool } from "./pool.js";

export interface AiTool {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  endpointUrl: string | null;
  requiresConfirmation: boolean;
  enabled: boolean;
  createdAt: Date;
}

export interface ToolInvocation {
  id: string;
  organizationId: string;
  toolId: string;
  args: Record<string, unknown> | null;
  result: unknown;
  error: string | null;
  status: string;
  latencyMs: number | null;
  createdAt: Date;
  completedAt: Date | null;
}

export async function getToolByName(
  organizationId: string,
  name: string,
): Promise<AiTool | null> {
  const { rows } = await pool.query<{
    id: string;
    organization_id: string;
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    endpoint_url: string | null;
    requires_confirmation: boolean;
    enabled: boolean;
    created_at: Date;
  }>(
    `SELECT id, organization_id, name, description, parameters,
            endpoint_url, requires_confirmation, enabled, created_at
     FROM ai_tools
     WHERE organization_id = $1 AND name = $2`,
    [organizationId, name],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    parameters: row.parameters,
    endpointUrl: row.endpoint_url,
    requiresConfirmation: row.requires_confirmation,
    enabled: row.enabled,
    createdAt: row.created_at,
  };
}

export async function listTools(organizationId: string): Promise<AiTool[]> {
  const { rows } = await pool.query<{
    id: string;
    organization_id: string;
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    endpoint_url: string | null;
    requires_confirmation: boolean;
    enabled: boolean;
    created_at: Date;
  }>(
    `SELECT id, organization_id, name, description, parameters,
            endpoint_url, requires_confirmation, enabled, created_at
     FROM ai_tools
     WHERE organization_id = $1
     ORDER BY name`,
    [organizationId],
  );

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    parameters: row.parameters,
    endpointUrl: row.endpoint_url,
    requiresConfirmation: row.requires_confirmation,
    enabled: row.enabled,
    createdAt: row.created_at,
  }));
}

export async function createTool(opts: {
  organizationId: string;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  endpointUrl?: string;
  requiresConfirmation?: boolean;
}): Promise<AiTool> {
  const { rows } = await pool.query<{ id: string; created_at: Date }>(
    `INSERT INTO ai_tools
       (organization_id, name, description, parameters, endpoint_url, requires_confirmation)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, created_at`,
    [
      opts.organizationId,
      opts.name,
      opts.description,
      JSON.stringify(opts.parameters),
      opts.endpointUrl ?? null,
      opts.requiresConfirmation ?? false,
    ],
  );

  const row = rows[0]!;
  return {
    id: row.id,
    organizationId: opts.organizationId,
    name: opts.name,
    description: opts.description,
    parameters: opts.parameters,
    endpointUrl: opts.endpointUrl ?? null,
    requiresConfirmation: opts.requiresConfirmation ?? false,
    enabled: true,
    createdAt: row.created_at,
  };
}

export async function createInvocation(opts: {
  organizationId: string;
  toolId: string;
  args: Record<string, unknown>;
  status: string;
}): Promise<ToolInvocation> {
  const { rows } = await pool.query<{ id: string; created_at: Date }>(
    `INSERT INTO tool_invocations (organization_id, tool_id, args, status)
     VALUES ($1,$2,$3,$4)
     RETURNING id, created_at`,
    [opts.organizationId, opts.toolId, JSON.stringify(opts.args), opts.status],
  );
  const row = rows[0]!;
  return {
    id: row.id,
    organizationId: opts.organizationId,
    toolId: opts.toolId,
    args: opts.args,
    result: null,
    error: null,
    status: opts.status,
    latencyMs: null,
    createdAt: row.created_at,
    completedAt: null,
  };
}

export async function getInvocation(
  invocationId: string,
): Promise<ToolInvocation | null> {
  const { rows } = await pool.query<{
    id: string;
    organization_id: string;
    tool_id: string;
    args: Record<string, unknown> | null;
    result: unknown;
    error: string | null;
    status: string;
    latency_ms: number | null;
    created_at: Date;
    completed_at: Date | null;
  }>(
    `SELECT id, organization_id, tool_id, args, result, error, status,
            latency_ms, created_at, completed_at
     FROM tool_invocations
     WHERE id = $1`,
    [invocationId],
  );
  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    organizationId: row.organization_id,
    toolId: row.tool_id,
    args: row.args,
    result: row.result,
    error: row.error,
    status: row.status,
    latencyMs: row.latency_ms,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export async function completeInvocation(
  invocationId: string,
  status: string,
  result: unknown,
  latencyMs: number,
  error?: string,
): Promise<void> {
  await pool.query(
    `UPDATE tool_invocations
     SET status = $2, result = $3, error = $4,
         latency_ms = $5, completed_at = now()
     WHERE id = $1`,
    [invocationId, status, result !== null ? JSON.stringify(result) : null, error ?? null, latencyMs],
  );
}
