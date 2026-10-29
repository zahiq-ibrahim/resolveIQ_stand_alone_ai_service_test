
import "dotenv/config";
import pg from "pg";
import { generateEmbedding } from "../embeddings/generate-embedding.js";
import { ingestDocument } from "../ingestion/ingest-document.js";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});

export async function storeDocument(
  filePath: string,
  organizationId: string,
): Promise<{ documentId: string; chunkCount: number }> {
  if (!organizationId.trim()) {
    throw new Error("organizationId is required.");
  }

  // Extract, clean, and chunk the source document.
  const document = await ingestDocument(filePath);

  if (document.chunks.length === 0) {
    throw new Error("The document produced no chunks.");
  }

  // Generate embeddings before opening a database transaction.
  // API calls may take time; we don't want to hold a transaction open.
  const embeddedChunks = [];

  for (const chunk of document.chunks) {
    const embedding = await generateEmbedding(chunk.text);

    embeddedChunks.push({ chunk, embedding });

    console.log(
      `Generated embedding for chunk ${chunk.chunkIndex + 1}/${document.chunks.length}`,
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Insert a new document, or reuse the existing document
    // with the same source name in this organization.
    const documentResult = await client.query<{ id: string }>(
      `
        INSERT INTO documents (
          organization_id,
          source_name,
          content_type
        )
        VALUES ($1, $2, $3)
        ON CONFLICT (organization_id, source_name)
        DO UPDATE SET
          content_type = EXCLUDED.content_type,
          created_at = NOW()
        RETURNING id
      `,
      [
        organizationId,
        document.sourceName,
        document.contentType,
      ],
    );

    const documentId = documentResult.rows[0]?.id;

    if (!documentId) {
      throw new Error("Failed to create or retrieve document ID.");
    }

    // Replace the document's previous chunks.
    await client.query(
      "DELETE FROM document_chunks WHERE document_id = $1",
      [documentId],
    );

    for (const { chunk, embedding } of embeddedChunks) {
      await client.query(
        `
          INSERT INTO document_chunks (
            document_id,
            organization_id,
            chunk_index,
            content,
            start_char,
            end_char,
            embedding
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
        `,
        [
          documentId,
          organizationId,
          chunk.chunkIndex,
          chunk.text,
          chunk.startChar,
          chunk.endChar,
          JSON.stringify(embedding),
        ],
      );
    }

    await client.query("COMMIT");

    return {
      documentId,
      chunkCount: embeddedChunks.length,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
