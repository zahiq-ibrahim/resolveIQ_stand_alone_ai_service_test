
import { describe, expect, it } from "vitest";

import {
  ticketClassificationSchema,
} from "../src/schemas.js";

describe("ticketClassificationSchema", () => {
  it("accepts a valid classification", () => {
    const result = ticketClassificationSchema.safeParse({
      category: "billing",
      priority: "high",
      sentiment: "negative",
      summary: "The customer reports a duplicate charge.",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an invalid priority", () => {
    const result = ticketClassificationSchema.safeParse({
      category: "billing",
      priority: "super-high",
      sentiment: "negative",
      summary: "The customer reports a duplicate charge.",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty summary", () => {
    const result = ticketClassificationSchema.safeParse({
      category: "billing",
      priority: "high",
      sentiment: "negative",
      summary: "",
    });

    expect(result.success).toBe(false);
  });
});
