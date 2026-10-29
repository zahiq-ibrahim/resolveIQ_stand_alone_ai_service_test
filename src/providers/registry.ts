import { env } from "../config/env.js";
import { GeminiProvider } from "./gemini-provider.js";
import { GeminiEmbedder } from "./gemini-embedder.js";
import { LLMReranker } from "./llm-reranker.js";
import type { Embedder, LLMProvider, Reranker } from "./types.js";

// Singletons — created once per process
let _llm: LLMProvider | undefined;
let _embedder: Embedder | undefined;
let _reranker: Reranker | undefined;

export function getLLM(): LLMProvider {
  if (_llm) return _llm;

  const provider = env.AI_PROVIDER;

  if (provider === "gemini") {
    // Read key from process.env so tests can manipulate it after module load
    const key = process.env["GEMINI_API_KEY"];
    if (!key) throw new Error("GEMINI_API_KEY is required when AI_PROVIDER=gemini");
    _llm = new GeminiProvider(key, env.LLM_MODEL);
    return _llm;
  }

  if (provider === "openai") {
    const key = process.env["OPENAI_API_KEY"];
    if (!key) throw new Error("OPENAI_API_KEY is required when AI_PROVIDER=openai");
    // Placeholder — swap in an OpenAIProvider here when needed
    throw new Error("OpenAI provider is not yet implemented. Set AI_PROVIDER=gemini.");
  }

  throw new Error(`Unknown AI_PROVIDER: ${provider as string}`);
}

export function getEmbedder(): Embedder {
  if (_embedder) return _embedder;

  const provider = env.AI_PROVIDER;

  if (provider === "gemini") {
    const key = process.env["GEMINI_API_KEY"];
    if (!key) throw new Error("GEMINI_API_KEY is required when AI_PROVIDER=gemini");
    _embedder = new GeminiEmbedder(key, env.EMBEDDING_MODEL, env.EMBEDDING_DIMENSIONS);
    return _embedder;
  }

  throw new Error(`No embedder configured for AI_PROVIDER=${provider}`);
}

export function getReranker(): Reranker {
  if (_reranker) return _reranker;
  _reranker = new LLMReranker(getLLM());
  return _reranker;
}

/** For testing: inject mock providers directly. */
export function _setProviders(opts: {
  llm?: LLMProvider;
  embedder?: Embedder;
  reranker?: Reranker;
}): void {
  if (opts.llm !== undefined) _llm = opts.llm;
  if (opts.embedder !== undefined) _embedder = opts.embedder;
  if (opts.reranker !== undefined) _reranker = opts.reranker;
}

/** For testing: reset all singletons. */
export function _resetProviders(): void {
  _llm = undefined;
  _embedder = undefined;
  _reranker = undefined;
}
