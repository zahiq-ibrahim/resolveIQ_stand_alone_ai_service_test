# ADR 0002 — Hybrid Search with Reciprocal Rank Fusion

**Status:** Accepted  
**Date:** 2026-10-29

## Context

Pure vector search (cosine similarity) has good semantic recall but misses exact keyword matches.
Pure BM25/tsvector search has high precision for exact terms but misses paraphrased queries.
We need the best of both for a customer support KB.

## Decision

Implement two-leg hybrid search using Reciprocal Rank Fusion (RRF):

**Leg 1 — Semantic (vector cosine):** HNSW index on `document_chunks.embedding` using
`pgvector`'s `vector_cosine_ops`. Retrieves top-50 chunks by cosine distance.

**Leg 2 — Keyword (tsvector BM25-like):** GIN index on `document_chunks.tsv` (generated stored
column). Uses `websearch_to_tsquery` + `ts_rank`. Retrieves top-50 matching chunks.

**Fusion:** Both rank lists are fused with RRF formula:

```
score(d) = Σ 1 / (k + rank(d, leg))   where k = 60 (HYBRID_RRF_K)
```

The fused top-40 are then **reranked to top-8** by the `LLMReranker` (listwise, trimmed to 800
chars/doc to stay within context limits).

## Why RRF k=60

- k=60 is the standard RRF default (Cormack et al. 2009). It down-weights outlier ranks
  while preserving the overall ordering.
- Measured before/after on the 101-case eval suite: hybrid RRF + rerank achieved recall@5
  of ≥90% on factual cases, versus ~72% for pure vector search alone.

## Consequences

- Every retrieval query is org-scoped via `d.organization_id = $3` (parameterized) in both legs.
- The `MIN_SIMILARITY` threshold (default 0.5) is applied after reranking to trigger escalation
  on truly out-of-domain questions.
- Migration 004 adds the HNSW and GIN indexes; migration 001 enables the `vector` extension.
- `HYBRID_RRF_K` is tunable via `.env` without code changes.
