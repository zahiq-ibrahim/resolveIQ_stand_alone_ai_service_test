import type { FastifyInstance } from "fastify";
import { createTool, listTools } from "../../../database/tools.js";

export async function toolsRoutes(app: FastifyInstance): Promise<void> {
  // POST /admin/tools
  app.post("/", async (request, reply) => {
    const body = request.body as {
      organizationId?: unknown;
      name?: unknown;
      description?: unknown;
      parameters?: unknown;
      endpointUrl?: unknown;
      requiresConfirmation?: unknown;
    };

    const organizationId = String(body.organizationId ?? "").trim();
    const name = String(body.name ?? "").trim();
    const description = String(body.description ?? "").trim();

    if (!organizationId) return reply.status(400).send({ error: "organizationId required" });
    if (!name) return reply.status(400).send({ error: "name required" });
    if (!body.parameters || typeof body.parameters !== "object") {
      return reply.status(400).send({ error: "parameters (JSON Schema object) required" });
    }

    const tool = await createTool({
      organizationId,
      name,
      description,
      parameters: body.parameters as Record<string, unknown>,
      ...(body.endpointUrl ? { endpointUrl: String(body.endpointUrl) } : {}),
      requiresConfirmation: body.requiresConfirmation === true,
    });

    return reply.status(201).send(tool);
  });

  // GET /admin/tools?organizationId=
  app.get("/", async (request, reply) => {
    const query = request.query as { organizationId?: string };
    if (!query.organizationId) {
      return reply.status(400).send({ error: "organizationId query param required" });
    }
    const tools = await listTools(query.organizationId);
    return reply.send(tools);
  });
}
