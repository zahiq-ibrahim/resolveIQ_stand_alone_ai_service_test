import type { Job } from "bullmq";
import { withTx, pool } from "../../database/pool.js";
import {
  markProcessing,
  markReady,
  markFailed,
} from "../../database/documents.js";
import { extractText } from "../../ingestion/extract-text.js";
import { cleanText } from "../../ingestion/clean-text.js";
import { chunkText } from "../../ingestion/chunk-text.js";
import { getEmbedder } from "../../providers/registry.js";
import type { IngestionJobData } from "../queues.js";

export async function processIngestion(
  job: Job<IngestionJobData>,
): Promise<void> {
  const { documentId, reindex } = job.data;
  const embedder = getEmbedder();

  await markProcessing(documentId);

  try {
    // Fetch document metadata
    const { rows } = await pool.query<{
      file_path: string | null;
      raw_text: string | null;
    }>(
      "SELECT file_path, raw_text FROM documents WHERE id = $1",
      [documentId],
    );

    const doc = rows[0];
    if (!doc) throw new Error(`Document ${documentId} not found in database.`);

    // Extract raw text
    let rawText: string;
    if (doc.file_path) {
      const extracted = await extractText(doc.file_path);
      rawText = extracted.text;
    } else if (doc.raw_text) {
      rawText = doc.raw_text;
    } else {
      throw new Error(
        `Document ${documentId} has neither file_path nor raw_text.`,
      );
    }

    // Clean + chunk
    const clean = cleanText(rawText);
    const chunks = chunkText(clean);

    if (chunks.length === 0) {
      throw new Error("Document produced no chunks after cleaning.");
    }

    await job.updateProgress(20);

    // Embed in batches of 32 (GeminiEmbedder handles 429 backoff)
    const vectors: number[][] = [];
    for (let i = 0; i < chunks.length; i += 32) {
      const batch = chunks.slice(i, i + 32).map((c) => c.text);
      const batchVectors = await embedder.embedDocuments(batch);
      vectors.push(...batchVectors);
      await job.updateProgress(
        20 + Math.round((60 * Math.min(i + 32, chunks.length)) / chunks.length),
      );
    }

    // Upsert chunks in a transaction
    await withTx(async (client) => {
      if (reindex) {
        await client.query(
          "DELETE FROM document_chunks WHERE document_id = $1",
          [documentId],
        );
      }

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!;
        const vector = vectors[i]!;
        await client.query(
          `INSERT INTO document_chunks
             (document_id, organization_id, chunk_index, chunk_text, start_char, end_char, embedding)
           SELECT $1, organization_id, $2, $3, $4, $5, $6::vector
           FROM documents WHERE id = $1
           ON CONFLICT (document_id, chunk_index) DO UPDATE
             SET chunk_text = EXCLUDED.chunk_text,
                 start_char = EXCLUDED.start_char,
                 end_char   = EXCLUDED.end_char,
                 embedding  = EXCLUDED.embedding`,
          [
            documentId,
            i,
            chunk.text,
            chunk.startChar,
            chunk.endChar,
            `[${vector.join(",")}]`,
          ],
        );
      }
    });

    await markReady(documentId);
    await job.updateProgress(100);
  } catch (err) {
    await markFailed(documentId, (err as Error).message);
    throw err; // Let BullMQ retry; after final attempt, document stays 'failed'
  }
}
