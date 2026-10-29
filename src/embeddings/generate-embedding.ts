/**
 * Thin compatibility wrapper — keeps old import paths working while
 * delegating all actual work to the Embedder from the provider registry.
 *
 * New code should import getEmbedder() from src/providers/registry.ts directly.
 */
import { getEmbedder } from "../providers/registry.js";

export async function generateEmbedding(
  text: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" = "RETRIEVAL_DOCUMENT",
): Promise<number[]> {
  const embedder = getEmbedder();
  if (taskType === "RETRIEVAL_QUERY") {
    return embedder.embedQuery(text);
  }
  const results = await embedder.embedDocuments([text]);
  const embedding = results[0];
  if (!embedding) throw new Error("Embedder returned no result.");
  return embedding;
}
