import { pool } from "../database/pool.js";

export interface EvalReportMetrics {
  totalCases: number;
  recallAt5: number;
  recallAt3: number;
  mrrAvg: number;
  factCoverageAvg: number;
  citationPrecisionAvg: number;
  escalationPrecision: number;
  injectionRobustness: number;
  groundednessAvg: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  totalCostUsd: number;
  byQueryType: Record<string, { count: number; recallAt5: number }>;
}

export async function persistEvalRun(opts: {
  metrics: EvalReportMetrics;
  reportMd: string;
  caseCount: number;
}): Promise<string> {
  try {
    // Ensure eval_runs table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS eval_runs (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        case_count INT         NOT NULL,
        metrics    JSONB       NOT NULL,
        report_md  TEXT        NOT NULL
      )
    `);

    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO eval_runs (case_count, metrics, report_md)
       VALUES ($1,$2,$3)
       RETURNING id`,
      [opts.caseCount, JSON.stringify(opts.metrics), opts.reportMd],
    );
    return rows[0]?.id ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function buildMarkdownReport(
  metrics: EvalReportMetrics,
  failures: {
    id: string;
    question: string;
    missingSources: string[];
    missingFacts: string[];
    error?: string;
  }[],
): string {
  const rows = Object.entries(metrics.byQueryType)
    .map(([type, m]) => `| ${type} | ${m.count} | ${(m.recallAt5 * 100).toFixed(1)}% |`)
    .join("\n");

  const failureRows = failures
    .slice(0, 20)
    .map(
      (f) =>
        `| ${f.id} | ${f.question.slice(0, 60)} | ${f.missingSources.join(", ") || "-"} | ${f.missingFacts.join(", ").slice(0, 50) || "-"} |`,
    )
    .join("\n");

  return `# ResolveIQ Eval Report

## Aggregate Metrics

| Metric | Value |
|--------|-------|
| Total Cases | ${metrics.totalCases} |
| Recall@5 | ${(metrics.recallAt5 * 100).toFixed(1)}% |
| Recall@3 | ${(metrics.recallAt3 * 100).toFixed(1)}% |
| MRR (avg) | ${metrics.mrrAvg.toFixed(3)} |
| Fact Coverage | ${(metrics.factCoverageAvg * 100).toFixed(1)}% |
| Citation Precision | ${(metrics.citationPrecisionAvg * 100).toFixed(1)}% |
| Escalation Precision | ${(metrics.escalationPrecision * 100).toFixed(1)}% |
| Injection Robustness | ${(metrics.injectionRobustness * 100).toFixed(1)}% |
| Groundedness (avg) | ${metrics.groundednessAvg.toFixed(3)} |
| P50 Latency | ${metrics.p50LatencyMs}ms |
| P95 Latency | ${metrics.p95LatencyMs}ms |
| Total Cost | $${metrics.totalCostUsd.toFixed(4)} |

## By Query Type

| Query Type | Count | Recall@5 |
|------------|-------|----------|
${rows}

## Failures (up to 20)

| Case ID | Question | Missing Sources | Missing Facts |
|---------|----------|----------------|---------------|
${failureRows || "| — | No failures | — | — |"}
`;
}
