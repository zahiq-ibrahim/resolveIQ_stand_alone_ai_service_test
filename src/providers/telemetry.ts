import { pool } from "../database/pool.js";

export interface TelemetryContext {
  organizationId?: string;
  provider: string;
  model: string;
  operation: string;
}

export interface TelemetryResult {
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  success: boolean;
  error?: string;
}

/**
 * Wraps an AI provider call with timing + DB metrics recording.
 * The `fn` callback should return an object that optionally exposes
 * `usage: { inputTokens, outputTokens }` so tokens can be recorded.
 *
 * Failures are recorded with success=false before re-throwing.
 */
export async function withTelemetry<T extends object>(
  ctx: TelemetryContext,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  let result: T;
  let inputTokens = 0;
  let outputTokens = 0;
  let success = true;
  let errorMsg: string | undefined;

  try {
    result = await fn();
    // If the result carries usage metadata, extract it
    if ("usage" in result && result.usage !== null && typeof result.usage === "object") {
      const u = result.usage as { inputTokens?: number; outputTokens?: number };
      inputTokens = u.inputTokens ?? 0;
      outputTokens = u.outputTokens ?? 0;
    }
  } catch (err) {
    success = false;
    errorMsg = err instanceof Error ? err.message : String(err);
    await writeMetric(ctx, Date.now() - start, 0, 0, false, errorMsg);
    throw err;
  }

  const latencyMs = Date.now() - start;
  await writeMetric(ctx, latencyMs, inputTokens, outputTokens, success, undefined);
  return result;
}

async function writeMetric(
  ctx: TelemetryContext,
  latencyMs: number,
  inputTokens: number,
  outputTokens: number,
  success: boolean,
  error: string | undefined,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO ai_metrics
         (organization_id, provider, model, operation, latency_ms,
          input_tokens, output_tokens, success, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        ctx.organizationId ?? null,
        ctx.provider,
        ctx.model,
        ctx.operation,
        latencyMs,
        inputTokens,
        outputTokens,
        success,
        error ?? null,
      ],
    );
  } catch {
    // Telemetry must never crash the main path — swallow DB errors silently
  }
}
