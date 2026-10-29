import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoist mocks before any imports ──────────────────────────────────────────
const mocks = vi.hoisted(() => {
  process.env.AI_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
  process.env.DIRECT_URL = "postgresql://test:test@localhost/test";
  process.env.REDIS_URL = "redis://localhost:6379";
  process.env.ADMIN_API_KEY = "test-admin-key-32chars-xxxxxxxx";
  process.env.LLM_MODEL = "gemini-2.0-flash";
  process.env.EMBEDDING_MODEL = "gemini-embedding-001";
  process.env.EMBEDDING_DIMENSIONS = "768";

  return {
    embedContent: vi.fn(),
    generateContent: vi.fn(),
    poolQuery: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  };
});

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      embedContent: mocks.embedContent,
      generateContent: mocks.generateContent,
    };
  },
}));

vi.mock("pg", () => ({
  default: {
    Pool: class {
      query = mocks.poolQuery;
      connect = vi.fn();
      end = vi.fn();
    },
  },
}));

import { GeminiProvider } from "../src/providers/gemini-provider.js";
import { GeminiEmbedder } from "../src/providers/gemini-embedder.js";
import { LLMReranker } from "../src/providers/llm-reranker.js";
import { _resetProviders, _setProviders, getEmbedder, getLLM } from "../src/providers/registry.js";
import type { LLMProvider, Embedder } from "../src/providers/types.js";

// ─── Mock provider helpers ────────────────────────────────────────────────────

function makeMockLLM(textResponse = '{"order":[1,2]}'): LLMProvider {
  return {
    name: "mock-llm",
    complete: vi.fn().mockResolvedValue({
      text: textResponse,
      toolCalls: [],
      usage: { inputTokens: 10, outputTokens: 5 },
      model: "mock-model",
      latencyMs: 50,
    }),
  };
}

function makeMockEmbedder(): Embedder {
  return {
    name: "mock-embedder",
    dimensions: 768,
    embedDocuments: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    embedQuery: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  };
}

// ─── Registry tests ───────────────────────────────────────────────────────────

describe("Provider registry", () => {
  beforeEach(() => {
    _resetProviders();
  });

  it("returns the injected mock LLM", () => {
    const mock = makeMockLLM();
    _setProviders({ llm: mock });
    expect(getLLM()).toBe(mock);
  });

  it("returns the injected mock embedder", () => {
    const mock = makeMockEmbedder();
    _setProviders({ embedder: mock });
    expect(getEmbedder()).toBe(mock);
  });

  it("throws when GEMINI_API_KEY is missing", () => {
    const originalKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "";
    expect(() => getLLM()).toThrow("GEMINI_API_KEY");
    process.env.GEMINI_API_KEY = originalKey;
  });
});

// ─── GeminiProvider tests ─────────────────────────────────────────────────────

describe("GeminiProvider", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes json:true as responseMimeType application/json", async () => {
    mocks.generateContent.mockResolvedValue({
      text: '{"ok":true}',
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      candidates: [],
    });

    const provider = new GeminiProvider("key", "gemini-2.0-flash");
    await provider.complete({
      messages: [{ role: "user", content: "test" }],
      json: true,
    });

    const call = mocks.generateContent.mock.calls[0]?.[0] as Record<string, unknown>;
    expect((call["config"] as Record<string, unknown>)?.["responseMimeType"]).toBe(
      "application/json",
    );
  });

  it("extracts usage tokens from usageMetadata", async () => {
    mocks.generateContent.mockResolvedValue({
      text: "answer",
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
      candidates: [],
    });

    const provider = new GeminiProvider("key", "gemini-2.0-flash");
    const res = await provider.complete({
      messages: [{ role: "user", content: "hello" }],
    });

    expect(res.usage.inputTokens).toBe(100);
    expect(res.usage.outputTokens).toBe(50);
  });

  it("returns empty toolCalls when model returns no function calls", async () => {
    mocks.generateContent.mockResolvedValue({
      text: "plain text",
      usageMetadata: {},
      candidates: [{ content: { parts: [{ text: "plain text" }] } }],
    });

    const provider = new GeminiProvider("key", "gemini-2.0-flash");
    const res = await provider.complete({
      messages: [{ role: "user", content: "hello" }],
    });

    expect(res.toolCalls).toEqual([]);
  });

  it("measures latency", async () => {
    mocks.generateContent.mockResolvedValue({
      text: "hello",
      usageMetadata: {},
      candidates: [],
    });

    const provider = new GeminiProvider("key", "gemini-2.0-flash");
    const res = await provider.complete({
      messages: [{ role: "user", content: "hello" }],
    });

    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

// ─── GeminiEmbedder tests ─────────────────────────────────────────────────────

describe("GeminiEmbedder", () => {
  beforeEach(() => vi.clearAllMocks());

  const makeEmbedResponse = (values: number[]) => ({
    embeddings: [{ values }],
  });

  it("normalizes embeddings to unit length", async () => {
    const raw = [3, 4]; // magnitude = 5
    mocks.embedContent.mockResolvedValue(makeEmbedResponse(raw));

    const embedder = new GeminiEmbedder("key", "gemini-embedding-001", 2);
    const result = await embedder.embedQuery("test");

    expect(result[0]).toBeCloseTo(0.6);
    expect(result[1]).toBeCloseTo(0.8);
  });

  it("retries on simulated 429 error then succeeds", async () => {
    const raw = [1, 0];
    mocks.embedContent
      .mockRejectedValueOnce(new Error("429 rate limit"))
      .mockResolvedValueOnce(makeEmbedResponse(raw));

    const embedder = new GeminiEmbedder("key", "gemini-embedding-001", 2);
    const result = await embedder.embedQuery("retry test");

    expect(mocks.embedContent).toHaveBeenCalledTimes(2);
    expect(result[0]).toBeCloseTo(1.0);
  });

  it("throws after exhausting retries on persistent 429", async () => {
    mocks.embedContent.mockRejectedValue(new Error("429 too many requests"));

    const embedder = new GeminiEmbedder("key", "gemini-embedding-001", 2);
    await expect(embedder.embedQuery("fail")).rejects.toThrow("429");
  }, 30_000);
});

// ─── LLMReranker tests ────────────────────────────────────────────────────────

describe("LLMReranker", () => {
  it("reorders docs based on LLM response", async () => {
    const llm = makeMockLLM('{"order":[3,1,2]}');
    const reranker = new LLMReranker(llm);

    const docs = [
      { id: "a", text: "first" },
      { id: "b", text: "second" },
      { id: "c", text: "third" },
    ];

    const result = await reranker.rerank("query", docs, 3);

    expect(result[0]?.id).toBe("c"); // doc 3 = index 2 = id "c"
    expect(result[1]?.id).toBe("a");
    expect(result[2]?.id).toBe("b");
  });

  it("falls back to original order on parse failure", async () => {
    const llm = makeMockLLM("not valid json {{{");
    const reranker = new LLMReranker(llm);

    const docs = [
      { id: "x", text: "foo" },
      { id: "y", text: "bar" },
    ];

    const result = await reranker.rerank("query", docs, 2);

    expect(result[0]?.id).toBe("x");
    expect(result[1]?.id).toBe("y");
  });

  it("returns empty array for empty doc list", async () => {
    const llm = makeMockLLM('{"order":[]}');
    const reranker = new LLMReranker(llm);
    const result = await reranker.rerank("query", [], 5);
    expect(result).toEqual([]);
  });

  it("limits results to topK", async () => {
    const llm = makeMockLLM('{"order":[1,2,3,4,5]}');
    const reranker = new LLMReranker(llm);

    const docs = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      text: `doc ${i}`,
    }));

    const result = await reranker.rerank("query", docs, 3);
    expect(result).toHaveLength(3);
  });
});
