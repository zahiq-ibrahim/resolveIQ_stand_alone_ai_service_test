import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Environment + mocks setup ────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  process.env.AI_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "test-key";
  process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
  process.env.DIRECT_URL = "postgresql://test:test@localhost/test";
  process.env.REDIS_URL = "redis://localhost:6379";
  process.env.ADMIN_API_KEY = "test-admin-key-32chars-xxxxxxxx";
  process.env.LLM_MODEL = "gemini-2.0-flash";

  return {
    llmComplete: vi.fn(),
    poolQuery: vi.fn().mockResolvedValue({ rows: [] }),
  };
});

vi.mock("pg", () => ({
  default: {
    Pool: class {
      query = mocks.poolQuery;
      connect = vi.fn();
      end = vi.fn();
    },
  },
}));

vi.mock("../src/providers/registry.js", () => ({
  getLLM: () => ({
    name: "mock-llm",
    complete: mocks.llmComplete,
  }),
  getEmbedder: vi.fn(),
  getReranker: vi.fn(),
  _resetProviders: vi.fn(),
  _setProviders: vi.fn(),
}));

import { checkGroundedness } from "../src/rag/groundedness.js";

const CONTEXTS = [
  "Customers may request a refund within 30 days of purchase.",
  "Refunds are processed within 5 business days.",
];

describe("checkGroundedness", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns score >= 0.9 for fully supported answer", async () => {
    mocks.llmComplete.mockResolvedValue({
      text: JSON.stringify({
        supported: true,
        unsupported_claims: [],
        score: 0.95,
      }),
      toolCalls: [],
      usage: { inputTokens: 50, outputTokens: 20 },
      model: "mock",
      latencyMs: 100,
    });

    const result = await checkGroundedness(
      "You can get a refund within 30 days. [S1]",
      CONTEXTS,
    );

    expect(result.score).toBe(0.95);
    expect(result.supported).toBe(true);
    expect(result.unsupported_claims).toEqual([]);
  });

  it("returns score in 0.7–0.9 range with unsupported claims", async () => {
    mocks.llmComplete.mockResolvedValue({
      text: JSON.stringify({
        supported: false,
        unsupported_claims: ["Refunds come with a bonus credit."],
        score: 0.75,
      }),
      toolCalls: [],
      usage: { inputTokens: 50, outputTokens: 20 },
      model: "mock",
      latencyMs: 100,
    });

    const result = await checkGroundedness(
      "You can get a refund. Refunds come with a bonus credit.",
      CONTEXTS,
    );

    expect(result.score).toBe(0.75);
    expect(result.unsupported_claims).toHaveLength(1);
  });

  it("returns score < 0.7 for largely unsupported answer", async () => {
    mocks.llmComplete.mockResolvedValue({
      text: JSON.stringify({
        supported: false,
        unsupported_claims: ["We offer lifetime guarantees."],
        score: 0.4,
      }),
      toolCalls: [],
      usage: { inputTokens: 50, outputTokens: 20 },
      model: "mock",
      latencyMs: 100,
    });

    const result = await checkGroundedness(
      "We offer lifetime guarantees and full refunds any time.",
      CONTEXTS,
    );

    expect(result.score).toBeLessThan(0.7);
    expect(result.supported).toBe(false);
  });

  it("falls back to score 1.0 when LLM returns invalid JSON", async () => {
    mocks.llmComplete.mockResolvedValue({
      text: "not json {{",
      toolCalls: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      model: "mock",
      latencyMs: 0,
    });

    const result = await checkGroundedness("some answer", CONTEXTS);

    // Graceful fallback — should not throw
    expect(result.score).toBe(1.0);
    expect(result.supported).toBe(true);
  });

  it("passes context content to the LLM prompt", async () => {
    mocks.llmComplete.mockResolvedValue({
      text: JSON.stringify({ supported: true, unsupported_claims: [], score: 1.0 }),
      toolCalls: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      model: "mock",
      latencyMs: 0,
    });

    await checkGroundedness("test answer", CONTEXTS);

    const call = mocks.llmComplete.mock.calls[0]?.[0] as { messages: { role: string; content: string }[] };
    // The user message contains both CONTEXTS header and the context text
    const userMessage = call.messages.find((m) => m.role === "user");
    expect(userMessage?.content).toContain("CONTEXTS");
    expect(userMessage?.content).toContain("30 days");
    expect(userMessage?.content).toContain("5 business days");
  });
});
