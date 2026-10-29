import { pool } from "./pool.js";

export interface MetricsSummary {
  p50LatencyMs: number;
  p95LatencyMs: number;
  byOperation: Record<string, { p50: number; p95: number; count: number }>;
  totalCostUsd: number;
  suggestions: {
    pending: number;
    accepted: number;
    edited: number;
    rejected: number;
    blocked: number;
    acceptanceRate: number;
  };
}

export async function getMetrics(organizationId?: string): Promise<MetricsSummary> {
  const orgFilter = organizationId ? "AND organization_id = $1" : "";
  const params = organizationId ? [organizationId] : [];

  // Latency percentiles
  const latencyResult = await pool.query<{
    p50: string;
    p95: string;
  }>(
    `SELECT
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50,
       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95
     FROM ai_metrics
     WHERE success = true ${orgFilter}`,
    params,
  );

  // Per-operation breakdown
  const opResult = await pool.query<{
    operation: string;
    p50: string;
    p95: string;
    count: string;
  }>(
    `SELECT operation,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50,
       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95,
       COUNT(*)::text AS count
     FROM ai_metrics
     WHERE success = true ${orgFilter}
     GROUP BY operation`,
    params,
  );

  // Total cost
  const costResult = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(cost_usd), 0)::text AS total
     FROM ai_metrics ${orgFilter ? `WHERE ${orgFilter.slice(4)}` : ""}`,
    params,
  );

  // Suggestion counts
  const suggFilter = organizationId ? "WHERE organization_id = $1" : "";
  const suggResult = await pool.query<{
    status: string;
    count: string;
  }>(
    `SELECT status, COUNT(*)::text AS count
     FROM ai_suggestions ${suggFilter}
     GROUP BY status`,
    params,
  );

  const suggCounts: Record<string, number> = {};
  for (const row of suggResult.rows) {
    suggCounts[row.status] = Number(row.count);
  }

  const accepted = suggCounts["accepted"] ?? 0;
  const edited = suggCounts["edited"] ?? 0;
  const rejected = suggCounts["rejected"] ?? 0;
  const decided = accepted + edited + rejected;
  const acceptanceRate = decided > 0 ? (accepted + edited) / decided : 0;

  const byOperation: Record<string, { p50: number; p95: number; count: number }> = {};
  for (const row of opResult.rows) {
    byOperation[row.operation] = {
      p50: Math.round(Number(row.p50)),
      p95: Math.round(Number(row.p95)),
      count: Number(row.count),
    };
  }

  return {
    p50LatencyMs: Math.round(Number(latencyResult.rows[0]?.p50 ?? 0)),
    p95LatencyMs: Math.round(Number(latencyResult.rows[0]?.p95 ?? 0)),
    byOperation,
    totalCostUsd: Number(costResult.rows[0]?.total ?? 0),
    suggestions: {
      pending: suggCounts["pending"] ?? 0,
      accepted,
      edited,
      rejected,
      blocked: suggCounts["blocked"] ?? 0,
      acceptanceRate: Math.round(acceptanceRate * 1000) / 1000,
    },
  };
}
