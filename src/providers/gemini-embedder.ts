import { GoogleGenAI } from "@google/genai";
import type { Embedder } from "./types.js";

/** Maximum inputs per API call for gemini-embedding-001 */
const BATCH_SIZE = 32;
/** Exponential backoff: base delay 1s, max 4 retries, ×2 multiplier */
const BACKOFF_BASE_MS = 1_000;
const MAX_RETRIES = 4;

function l2Normalize(values: number[]): number[] {
  const magnitude = Math.sqrt(values.reduce((s, v) => s + v * v, 0));
  if (magnitude === 0) throw new Error("Cannot normalize a zero-length embedding.");
  return values.map((v) => v / magnitude);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GeminiEmbedder implements Embedder {
  readonly name = "gemini-embedder";
  readonly dimensions: number;

  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string, dimensions: number) {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
    this.dimensions = dimensions;
  }

  async embedDocuments(inputs: string[]): Promise<number[][]> {
    const results: number[][] = [];

    for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
      const batch = inputs.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((text) => this.embedWithRetry(text, "RETRIEVAL_DOCUMENT")),
      );
      results.push(...batchResults);
    }

    return results;
  }

  async embedQuery(input: string): Promise<number[]> {
    return this.embedWithRetry(input, "RETRIEVAL_QUERY");
  }

  private async embedWithRetry(
    text: string,
    taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
  ): Promise<number[]> {
    const input = text.trim();
    if (!input) throw new Error("Cannot embed empty text.");

    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.ai.models.embedContent({
          model: this.model,
          contents: input,
          config: {
            taskType,
            outputDimensionality: this.dimensions,
          },
        });

        const values = response.embeddings?.[0]?.values;

        if (!values || values.length !== this.dimensions) {
          throw new Error(
            `Expected ${this.dimensions} embedding dimensions, got ${values?.length ?? 0}.`,
          );
        }

        if (!values.every(Number.isFinite)) {
          throw new Error("Embedding contains invalid (NaN/Inf) values.");
        }

        return l2Normalize(values);
      } catch (err) {
        lastError = err;

        // Retry on rate-limit (429) or service-unavailable (503)
        const isRetryable =
          err instanceof Error &&
          (err.message.includes("429") || err.message.includes("503"));

        if (!isRetryable || attempt === MAX_RETRIES) break;

        const delay = BACKOFF_BASE_MS * Math.pow(2, attempt);
        await sleep(delay);
      }
    }

    throw lastError;
  }
}
