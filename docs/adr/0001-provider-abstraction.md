# ADR 0001 — Provider Abstraction Layer

**Status:** Accepted  
**Date:** 2026-10-29

## Context

The service needs to call LLM APIs (for text generation, reranking, groundedness checking) and
embedding APIs (for vector search). We initially built directly against the Gemini SDK, which
would make swapping to OpenAI or another provider a large refactor.

## Decision

All AI provider code lives exclusively inside `src/providers/`. No other module may import
`@google/genai`, `openai`, or any provider SDK directly.

Three interfaces are defined in `src/providers/types.ts`:

- **`LLMProvider`** — `complete(req): Promise<CompletionResponse>`
- **`Embedder`** — `embedDocuments(inputs)`, `embedQuery(input)`
- **`Reranker`** — `rerank(query, docs, topK)`

Concrete implementations live in:
- `gemini-provider.ts` — `GeminiProvider implements LLMProvider`
- `gemini-embedder.ts` — `GeminiEmbedder implements Embedder`
- `llm-reranker.ts` — `LLMReranker implements Reranker` (provider-agnostic listwise reranker)

`registry.ts` switches on `env.AI_PROVIDER` to return the correct singleton. Swapping to
OpenAI requires only:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-4o
```

No code changes needed.

## Consequences

- All provider-specific code is isolated and independently testable.
- Tests inject mock providers via `_setProviders()` — no real API calls in CI.
- Adding a new provider (Anthropic, Cohere, etc.) requires only implementing the three
  interfaces and adding a `case` to `registry.ts`.
- The `LLMReranker` uses whatever LLM is currently registered, so it automatically uses the
  production or mock LLM in tests.
