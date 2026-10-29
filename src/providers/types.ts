// ─── Core message / tool types ───────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

// ─── LLM provider ────────────────────────────────────────────────────────────

export interface CompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  /** When true, instructs the model to return valid JSON. */
  json?: boolean;
  tools?: ToolSpec[];
}

export interface CompletionResponse {
  text: string;
  toolCalls: ToolCall[];
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  latencyMs: number;
}

export interface LLMProvider {
  readonly name: string;
  complete(req: CompletionRequest): Promise<CompletionResponse>;
}

// ─── Embedder ────────────────────────────────────────────────────────────────

export interface Embedder {
  readonly name: string;
  readonly dimensions: number;
  /** Embed a batch of document strings (RETRIEVAL_DOCUMENT task type). */
  embedDocuments(inputs: string[]): Promise<number[][]>;
  /** Embed a single query string (RETRIEVAL_QUERY task type). */
  embedQuery(input: string): Promise<number[]>;
}

// ─── Reranker ─────────────────────────────────────────────────────────────────

export interface Reranker {
  readonly name: string;
  /**
   * Rerank `docs` by relevance to `query`.
   * Returns the top `topK` ids with normalized position scores (1.0 → best).
   */
  rerank(
    query: string,
    docs: { id: string; text: string }[],
    topK: number,
  ): Promise<{ id: string; score: number }[]>;
}
