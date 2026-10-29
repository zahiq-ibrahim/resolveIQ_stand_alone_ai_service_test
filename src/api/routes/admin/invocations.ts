import type { FastifyInstance } from "fastify";
import { executeTool, rejectInvocation } from "../../../tools/executor.js";
import { getInvocation } from "../../../database/tools.js";
import type { ToolCall } from "../../../providers/types.js";

export async function invocationsRoutes(app: FastifyInstance): Promise<void> {
  // POST /admin/invocations/:id/confirm
  app.post<{ Params: { id: string } }>("/:id/confirm", async (request, reply) => {
    const inv = await getInvocation(request.params.id);
    if (!inv) return reply.status(404).send({ error: "Invocation not found" });
    if (inv.status !== "awaiting_confirmation") {
      return reply
        .status(409)
        .send({ error: `Cannot confirm invocation with status: ${inv.status}` });
    }

    // Look up tool to build the ToolCall object
    const { pool } = await import("../../../database/pool.js");
    const { rows } = await pool.query<{ name: string }>(
      "SELECT name FROM ai_tools WHERE id = $1",
      [inv.toolId],
    );
    const toolName = rows[0]?.name ?? "";

    const call: ToolCall = {
      id: inv.id,
      name: toolName,
      args: inv.args ?? {},
    };

    const result = await executeTool(inv.organizationId, call, {
      confirmed: true,
      invocationId: inv.id,
    });

    return reply.send(result);
  });

  // POST /admin/invocations/:id/reject
  app.post<{ Params: { id: string } }>("/:id/reject", async (request, reply) => {
    const inv = await getInvocation(request.params.id);
    if (!inv) return reply.status(404).send({ error: "Invocation not found" });
    if (inv.status !== "awaiting_confirmation") {
      return reply
        .status(409)
        .send({ error: `Cannot reject invocation with status: ${inv.status}` });
    }

    await rejectInvocation(request.params.id);
    return reply.send({ id: request.params.id, status: "rejected" });
  });
}
