import {
  getToolByName,
  createInvocation,
  getInvocation,
  completeInvocation,
} from "../database/tools.js";
import { validateJsonSchema, SchemaValidationError } from "./json-schema.js";
import { hybridSearch } from "../database/search-hybrid.js";
import { getEmbedder } from "../providers/registry.js";
import { env } from "../config/env.js";
import type { ToolCall } from "../providers/types.js";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface AwaitingConfirmationResult {
  status: "awaiting_confirmation";
  invocationId: string;
}

export interface SucceededResult {
  status: "succeeded";
  result: unknown;
}

export interface RejectedResult {
  status: "rejected";
}

export type ExecutionResult =
  | AwaitingConfirmationResult
  | SucceededResult
  | RejectedResult;

// ─── Main gate ────────────────────────────────────────────────────────────────

/**
 * Execute a tool call, enforcing the confirmation gate.
 *
 * - Tools with requires_confirmation=true MUST NOT execute without confirmed=true.
 * - All invocation attempts are audited in tool_invocations.
 */
export async function executeTool(
  orgId: string,
  call: ToolCall,
  opts: { confirmed: boolean; invocationId?: string },
): Promise<ExecutionResult> {
  const tool = await getToolByName(orgId, call.name);

  if (!tool || !tool.enabled) {
    throw new AppError(404, `Unknown or disabled tool: ${call.name}`);
  }

  // Validate args against JSON Schema
  let args: Record<string, unknown>;
  try {
    args = validateJsonSchema(tool.parameters, call.args);
  } catch (err) {
    if (err instanceof SchemaValidationError) {
      throw new AppError(400, err.message);
    }
    throw err;
  }

  // Gate: requires confirmation but none provided
  if (tool.requiresConfirmation && !opts.confirmed) {
    const inv = await createInvocation({
      organizationId: orgId,
      toolId: tool.id,
      args,
      status: "awaiting_confirmation",
    });
    return { status: "awaiting_confirmation", invocationId: inv.id };
  }

  // Gate: confirmation provided — verify the pending invocation
  let invocationId: string | undefined;
  if (tool.requiresConfirmation && opts.confirmed) {
    const pendingId = opts.invocationId;
    if (!pendingId) throw new AppError(400, "invocationId required to confirm a tool call.");

    const pending = await getInvocation(pendingId);
    if (!pending || pending.status !== "awaiting_confirmation") {
      throw new AppError(409, "No pending awaiting_confirmation invocation found for this id.");
    }
    invocationId = pending.id;
  }

  // Create a 'running' invocation record for non-confirmation tools
  if (!invocationId) {
    const inv = await createInvocation({
      organizationId: orgId,
      toolId: tool.id,
      args,
      status: "running",
    });
    invocationId = inv.id;
  } else {
    // Update status to 'running'
    await completeInvocation(invocationId, "running", null, 0);
  }

  const started = Date.now();

  try {
    let result: unknown;
    if (tool.endpointUrl) {
      result = await httpPostJson(tool.endpointUrl, args, { timeoutMs: 10_000 });
    } else {
      result = await runBuiltinTool(orgId, call.name, args);
    }

    await completeInvocation(invocationId, "succeeded", result, Date.now() - started);
    return { status: "succeeded", result };
  } catch (err) {
    await completeInvocation(
      invocationId,
      "failed",
      null,
      Date.now() - started,
      (err as Error).message,
    );
    throw err;
  }
}

export async function rejectInvocation(invocationId: string): Promise<void> {
  await completeInvocation(invocationId, "rejected", null, 0);
}

// ─── Built-in tools ───────────────────────────────────────────────────────────

async function runBuiltinTool(
  orgId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "kb.search": {
      const query = String(args["query"] ?? "");
      const embedder = getEmbedder();
      const embedding = await embedder.embedQuery(query);
      return hybridSearch({
        organizationId: orgId,
        queryEmbedding: embedding,
        queryText: query,
        finalLimit: Number(args["limit"] ?? 5),
      });
    }

    case "ticket.getSimilar": {
      // Delegated to the similar-tickets module
      const { findSimilarTickets } = await import("../rag/similar-tickets.js");
      const ticketId = String(args["ticketId"] ?? "");
      return findSimilarTickets(ticketId, orgId);
    }

    default:
      throw new AppError(404, `No built-in tool named: ${name}`);
  }
}

// ─── HTTP executor ───────────────────────────────────────────────────────────

async function httpPostJson(
  url: string,
  body: Record<string, unknown>,
  opts: { timeoutMs: number },
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Tool endpoint returned HTTP ${response.status}: ${await response.text()}`);
    }

    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}
