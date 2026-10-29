import type { FastifyInstance } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import { pool } from "../../../database/pool.js";
import { getDocumentWithStats } from "../../../database/documents.js";
import { ingestionQueue } from "../../../worker/queues.js";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_TEXT_SIZE = 500 * 1024; // 500 KB

export async function documentsRoutes(app: FastifyInstance): Promise<void> {
  // POST /admin/documents — upload file or supply inline text
  app.post("/", async (request, reply) => {
    let title: string;
    let organizationId: string;
    let filePath: string | undefined;
    let rawText: string | undefined;
    let contentType: string;

    const contentTypeHeader = request.headers["content-type"] ?? "";

    if (contentTypeHeader.includes("multipart/form-data")) {
      // File upload
      const parts = request.parts();
      const fields: Record<string, string> = {};
      let file: MultipartFile | undefined;

      for await (const part of parts) {
        if (part.type === "file") {
          file = part;
          const buf = await part.toBuffer();
          if (buf.length > MAX_FILE_SIZE) {
            return reply.status(413).send({ error: "File exceeds 20 MB limit" });
          }
          // Write to a temp path — in production use object storage
          const { writeFile } = await import("node:fs/promises");
          const { tmpdir } = await import("node:os");
          const { join } = await import("node:path");
          const tmpPath = join(tmpdir(), `resolveiq-${Date.now()}-${part.filename}`);
          await writeFile(tmpPath, buf);
          filePath = tmpPath;
        } else {
          fields[part.fieldname] = part.value as string;
        }
      }

      if (!file || !filePath) return reply.status(400).send({ error: "file is required" });
      title = fields["title"] ?? file.filename;
      organizationId = fields["organizationId"] ?? "";
      contentType = file.mimetype;
    } else {
      // JSON inline text
      const body = request.body as { title?: unknown; text?: unknown; organizationId?: unknown };
      title = String(body.title ?? "").trim();
      rawText = String(body.text ?? "").trim();
      organizationId = String(body.organizationId ?? "").trim();
      contentType = "text/plain";

      if (!rawText) return reply.status(400).send({ error: "text is required" });
      if (rawText.length > MAX_TEXT_SIZE) {
        return reply.status(413).send({ error: "text exceeds 500 KB limit" });
      }
    }

    if (!organizationId) return reply.status(400).send({ error: "organizationId is required" });
    if (!title) return reply.status(400).send({ error: "title is required" });

    // Ensure org exists
    const { rowCount } = await pool.query(
      "SELECT id FROM organizations WHERE id = $1",
      [organizationId],
    );
    if ((rowCount ?? 0) === 0) {
      return reply.status(404).send({ error: "Organization not found" });
    }

    // Insert document row in 'queued' state
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO documents
         (organization_id, title, source_name, content_type, file_path, raw_text, status)
       VALUES ($1,$2,$3,$4,$5,$6,'queued')
       RETURNING id`,
      [organizationId, title, title, contentType, filePath ?? null, rawText ?? null],
    );

    const documentId = rows[0]!.id;

    // Enqueue ingestion job
    await ingestionQueue.add("ingest", { documentId, organizationId });

    return reply.status(202).send({ documentId, status: "queued" });
  });

  // GET /admin/documents/:id
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const stats = await getDocumentWithStats(request.params.id);
    if (!stats) return reply.status(404).send({ error: "Document not found" });
    return reply.send(stats);
  });

  // POST /admin/documents/:id/reindex
  app.post<{ Params: { id: string } }>("/:id/reindex", async (request, reply) => {
    const doc = await getDocumentWithStats(request.params.id);
    if (!doc) return reply.status(404).send({ error: "Document not found" });

    await pool.query("UPDATE documents SET status = 'queued' WHERE id = $1", [request.params.id]);
    await ingestionQueue.add("ingest", {
      documentId: request.params.id,
      organizationId: "",
      reindex: true,
    });

    return reply.send({ documentId: request.params.id, status: "queued" });
  });
}
