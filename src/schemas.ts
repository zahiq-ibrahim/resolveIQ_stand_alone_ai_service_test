
import { z } from "zod";

export const ticketClassificationSchema = z.object({
  category: z.enum([
    "billing",
    "technical",
    "account",
    "cancellation",
    "other",
  ]),

  priority: z.enum([
    "low",
    "medium",
    "high",
    "urgent",
  ]),

  sentiment: z.enum([
    "positive",
    "neutral",
    "negative",
  ]),

  summary: z.string().min(1).max(200),
});

export type TicketClassification = z.infer<
  typeof ticketClassificationSchema
>;
