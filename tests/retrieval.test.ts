import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Environment setup (must happen before any imports) ───────────────────────
const mocks = vi.hoisted(() => {
  process.env.AI_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "test-key";
  process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
  process.env.DIRECT_URL = "postgresql://test:test@localhost/test";
  process.env.REDIS_URL = "redis://localhost:6379";
  process.env.ADMIN_API_KEY = "test-admin-key-32chars-xxxxxxxx";
  process.env.LLM_MODEL = "gemini-2.0-flash";
  process.env.EMBEDDING_MODEL = "gemini-embedding-001";
  process.env.HYBRID_RRF_K = "60";
  process.env.MIN_SIMILARITY = "0.5";

  return {
    poolQuery: vi.fn(),
    poolConnect: vi.fn(),
  };
});

vi.mock("pg", () => ({
  default: {
    Pool: class {
      query = mocks.poolQuery;
      connect = mocks.poolConnect;
      end = vi.fn();
    },
  },
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      embedContent: vi.fn(),
      generateContent: vi.fn(),
    };
  },
}));

import { hybridSearch } from "../src/database/search-hybrid.js";

// ─── RRF math tests ───────────────────────────────────────────────────────────

describe("hybridSearch — RRF fusion math", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns fused rows ordered by descending rrf_score", async () => {
    // Simulate the SQL returning pre-computed fused rows
    mocks.poolQuery.mockResolvedValue({
      rows: [
        {
          id: "chunk-c",
          document_id: "doc-1",
          rrf_score: "0.0320",
          document_title: "Policy A",
          chunk_text: "High relevance content",
          chunk_index: 0,
        },
        {
          id: "chunk-a",
          document_id: "doc-1",
          rrf_score: "0.0305",
          document_title: "Policy A",
          chunk_text: "Medium relevance content",
          chunk_index: 1,
        },
        {
          id: "chunk-b",
          document_id: "doc-2",
          rrf_score: "0.0160",
          document_title: "Policy B",
          chunk_text: "Low relevance content",
          chunk_index: 0,
        },
      ],
    });

    const results = await hybridSearch({
      organizationId: "org-a",
      queryEmbedding: [0.1, 0.2, 0.3],
      queryText: "refund policy",
    });

    expect(results).toHaveLength(3);
    expect(results[0]?.id).toBe("chunk-c");
    expect(results[0]?.score).toBeCloseTo(0.0320);
    expect(results[1]?.id).toBe("chunk-a");
    expect(results[2]?.id).toBe("chunk-b");
  });

  it("enforces org isolation: SQL must contain organization_id = $3 parameter", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [] });

    await hybridSearch({
      organizationId: "org-a",
      queryEmbedding: [0.1, 0.2, 0.3],
      queryText: "test query",
    });

    expect(mocks.poolQuery).toHaveBeenCalledOnce();
    const [sql, params] = mocks.poolQuery.mock.calls[0] as [string, unknown[]];

    // Org isolation: organization_id = $3 must appear in the SQL
    expect(sql).toContain("organization_id = $3");
    // Third parameter (index 2) must be the org ID
    expect(params[2]).toBe("org-a");
  });

  it("passes different org IDs as distinct SQL parameters", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [] });

    await hybridSearch({
      organizationId: "org-b",
      queryEmbedding: [0.1, 0.2, 0.3],
      queryText: "test",
    });

    const [, params] = mocks.poolQuery.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBe("org-b");
  });

  it("returns empty array when SQL returns no rows", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [] });

    const results = await hybridSearch({
      organizationId: "org-a",
      queryEmbedding: [0.1, 0.2, 0.3],
      queryText: "unknown topic",
    });

    expect(results).toEqual([]);
  });

  it("maps SQL rows to ScoredChunk interface correctly", async () => {
    mocks.poolQuery.mockResolvedValue({
      rows: [
        {
          id: "uuid-1",
          document_id: "doc-uuid",
          rrf_score: "0.025",
          document_title: "My Doc",
          chunk_text: "some text here",
          chunk_index: 2,
        },
      ],
    });

    const results = await hybridSearch({
      organizationId: "org-a",
      queryEmbedding: [0.5, 0.5],
      queryText: "my query",
    });

    expect(results[0]).toEqual({
      id: "uuid-1",
      documentId: "doc-uuid",
      documentTitle: "My Doc",
      chunkText: "some text here",
      chunkIndex: 2,
      score: 0.025,
    });
  });
});

// ─── Reranker ordering + fallback ────────────────────────────────────────────

import { LLMReranker } from "../src/providers/llm-reranker.js";
import type { LLMProvider } from "../src/providers/types.js";

function makeOrderedLLM(order: number[]): LLMProvider {
  return {
    name: "mock",
    complete: vi.fn().mockResolvedValue({
      text: JSON.stringify({ order }),
      toolCalls: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      model: "mock",
      latencyMs: 0,
    }),
  };
}

describe("LLMReranker ordering", () => {
  it("reorders docs according to LLM order response", async () => {
    const reranker = new LLMReranker(makeOrderedLLM([3, 1, 2]));
    const docs = [
      { id: "a", text: "first" },
      { id: "b", text: "second" },
      { id: "c", text: "third" },
    ];

    const result = await reranker.rerank("query", docs, 3);
    expect(result.map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("falls back to original order on malformed LLM JSON", async () => {
    const llm: LLMProvider = {
      name: "mock",
      complete: vi.fn().mockResolvedValue({
        text: "INVALID {{{",
        toolCalls: [],
        usage: { inputTokens: 0, outputTokens: 0 },
        model: "mock",
        latencyMs: 0,
      }),
    };

    const reranker = new LLMReranker(llm);
    const docs = [
      { id: "x", text: "foo" },
      { id: "y", text: "bar" },
    ];
    const result = await reranker.rerank("query", docs, 2);
    expect(result.map((r) => r.id)).toEqual(["x", "y"]);
  });

  it("assigns score 1.0 to best-ranked document", async () => {
    const reranker = new LLMReranker(makeOrderedLLM([1, 2]));
    const docs = [
      { id: "a", text: "best" },
      { id: "b", text: "worst" },
    ];
    const result = await reranker.rerank("query", docs, 2);
    expect(result[0]?.score).toBe(1.0);
    expect(result[1]?.score).toBe(0.0);
  });
});
