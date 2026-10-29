import { describe, expect, it } from "vitest";

import { cleanText } from "../src/ingestion/clean-text.js";
import { chunkText } from "../src/ingestion/chunk-text.js";

describe("cleanText", () => {
  it("normalizes whitespace without removing paragraph breaks", () => {
    const result = cleanText(
      " Refund Policy \r\n\r\n   Customers may request a refund. ",
    );

    expect(result).toBe(
      "Refund Policy\n\nCustomers may request a refund.",
    );
  });

  it("removes null characters", () => {
    expect(cleanText("Refund\u0000 policy")).toBe("Refund policy");
  });
});

describe("chunkText", () => {
  it("returns no chunks for empty input", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("splits long text into indexed chunks", () => {
    const text = "word ".repeat(500);
    const chunks = chunkText(text, 100, 20);

    expect(chunks.length).toBeGreaterThan(1);

    chunks.forEach((chunk, index) => {
      expect(chunk.chunkIndex).toBe(index);
      expect(chunk.text.length).toBeGreaterThan(0);
      expect(chunk.text.length).toBeLessThanOrEqual(100);
    });
  });

  it("rejects invalid chunk settings", () => {
    expect(() => chunkText("some text", 0, 0)).toThrow();
    expect(() => chunkText("some text", 100, 100)).toThrow();
  });
});