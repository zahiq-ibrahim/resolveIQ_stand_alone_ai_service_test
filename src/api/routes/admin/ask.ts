import type { FastifyInstance } from "fastify";
import { askWithMemory } from "../../../memory/conversation.js";

const MAX_QUESTION_CHARS = 2000;

export async function askRoutes(app: FastifyInstance): Promise<void> {
  app.post("/", async (request, reply) => {
    const body = request.body as {
      organizationId?: unknown;
      question?: unknown;
      conversationId?: unknown;
    };

    const organizationId = String(body.organizationId ?? "").trim();
    const question = String(body.question ?? "").trim();
    const conversationId = body.conversationId ? String(body.conversationId) : undefined;

    if (!organizationId) return reply.status(400).send({ error: "organizationId required" });
    if (!question) return reply.status(400).send({ error: "question required" });
    if (question.length > MAX_QUESTION_CHARS) {
      return reply.status(400).send({ error: `question exceeds ${MAX_QUESTION_CHARS} chars` });
    }

    const result = await askWithMemory({
      organizationId,
      question,
      ...(conversationId !== undefined ? { conversationId } : {}),
    });
    return reply.send(result);
  });
}
