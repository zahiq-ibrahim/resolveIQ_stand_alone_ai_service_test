
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  end: vi.fn(),
  generateEmbedding: vi.fn(),
}));

vi.mock("pg", () => ({
  default: {
    Pool: class {
      query = mocks.query;
      connect = mocks.connect;
      end = mocks.end;
    },
  },
}));

vi.mock("../src/embeddings/generate-embedding.js", () => ({
  generateEmbedding: mocks.generateEmbedding,
}));

import {
  closeSearchDatabase,
  searchDocuments,
} from "../src/database/search-documents.js";

describe("Organization isolation", () => {
  afterEach(async () => {
    vi.clearAllMocks();
    await closeSearchDatabase();
  });

  it("passes the requested organization ID as a SQL parameter", async () => {
    mocks.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);

    mocks.query.mockResolvedValue({
      rows: [
        {
          documentId: "doc-org-a",
          sourceName: "org-a-policy.md",
          chunkIndex: 0,
          content: "Organization A policy",
          similarity: 0.9,
        },
      ],
    });

    const results = await searchDocuments(
      "refund policy",
      "org-a",
      5,
    );

    expect(mocks.query).toHaveBeenCalledOnce();

    const [sql, params] = mocks.query.mock.calls[0]!;

    expect(sql).toContain("c.organization_id = $2");
    expect(params[1]).toBe("org-a");
    expect(params[2]).toBe(5);

    expect(results).toHaveLength(1);
    expect(results[0]?.documentId).toBe("doc-org-a");
  });

  it("uses a different organization ID for a different request", async () => {
    mocks.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mocks.query.mockResolvedValue({ rows: [] });

    await searchDocuments("refund policy", "org-b", 5);

    const [, params] = mocks.query.mock.calls[0]!;

    expect(params[1]).toBe("org-b");
  });

  it("rejects an empty organization ID", async () => {
    await expect(
      searchDocuments("refund policy", " ", 5),
    ).rejects.toThrow();

    expect(mocks.query).not.toHaveBeenCalled();
  });
});
