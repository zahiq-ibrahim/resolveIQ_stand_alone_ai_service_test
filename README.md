# ResolveIQ — Standalone AI/RAG Service

> Intern 3 (AI & RAG Engineer) scope — TypeScript microservice for the ResolveIQ support-ticket copilot.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          API (Fastify)                          │
│  POST /admin/ask  POST /admin/draft  POST /admin/tickets/…      │
│  GET  /admin/metrics  POST /admin/eval/run   GET /health        │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
   ┌──────▼──────┐  ┌──────▼──────┐  ┌─────▼──────────┐
   │   RAG Core  │  │  Tool Gate  │  │ Session Memory  │
   │  hybrid     │  │  executor   │  │ conversation.ts │
   │  search +   │  │  + confirm  │  │ rolling summary │
   │  rerank +   │  │  gate       │  └─────────────────┘
   │  ground.    │  └─────────────┘
   └──────┬──────┘
          │
   ┌──────▼──────────────────────────────────────────┐
   │              Provider Abstraction               │
   │  LLMProvider  Embedder  Reranker               │
   │  GeminiProvider  GeminiEmbedder  LLMReranker   │
   └──────┬──────────────────────────────────────────┘
          │
   ┌──────▼────────────────────┐    ┌────────────────────┐
   │   Neon Postgres           │    │  Redis (BullMQ)    │
   │   pgvector HNSW + GIN     │    │  ingestion queue   │
   │   documents, chunks,      │    │  3 retries + exp.  │
   │   tickets, tools, convs   │    │  backoff           │
   └───────────────────────────┘    └────────────────────┘
          │
   ┌──────▼───────────────────────────────────────────┐
   │               BullMQ Worker                      │
   │  extract → clean → chunk → embed → upsert        │
   │  document state machine: queued→processing→ready │
   └──────────────────────────────────────────────────┘
```

## Setup

### Prerequisites

- Node.js 20+
- Docker (for local Redis) or Upstash account
- Neon Postgres project ([neon.tech](https://neon.tech)) with `vector` extension

### 1. Install

```bash
npm install
cp .env.example .env
# Fill in DATABASE_URL, DIRECT_URL, REDIS_URL, ADMIN_API_KEY, GEMINI_API_KEY
```

### 2. Neon Setup

In your Neon project, copy **two** connection strings:

| Variable | Which URL |
|----------|-----------|
| `DATABASE_URL` | Pooled (host contains `-pooler`) |
| `DIRECT_URL` | Direct (no `-pooler`) — used only by migrate |

The first migration runs `CREATE EXTENSION IF NOT EXISTS vector;` automatically.

### 3. Redis

**Local dev:**
```bash
docker compose up -d redis
```

**Production:** Use [Upstash](https://upstash.com) free tier. Set `REDIS_URL=rediss://...`

### 4. Migrate + Seed

```bash
npm run migrate   # idempotent — runs all 8 SQL migrations
npm run seed      # creates 2 orgs, ~23 docs, 12 tickets, 3 tools
```

### 5. Start

```bash
# Terminal 1 — Worker (processes ingestion jobs)
npm run worker

# Terminal 2 — API
npm run api
```

## API Reference

All `/admin/*` routes require header: `x-admin-key: <ADMIN_API_KEY>`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (public) |
| POST | `/admin/organizations` | Create organization |
| POST | `/admin/documents` | Upload document (multipart or JSON) |
| GET | `/admin/documents/:id` | Get document status + chunk count |
| POST | `/admin/documents/:id/reindex` | Re-ingest document |
| POST | `/admin/tools` | Register a tool |
| GET | `/admin/tools?organizationId=` | List tools for org |
| POST | `/admin/tickets` | Create ticket |
| POST | `/admin/tickets/:id/classify` | Classify ticket (category/sentiment/priority) |
| GET | `/admin/tickets/:id/similar` | Find similar tickets |
| POST | `/admin/ask` | Ask a question (with memory) |
| POST | `/admin/draft` | Generate draft reply for ticket |
| POST | `/admin/draft/suggestions/:id/decision` | Accept / edit / reject suggestion |
| POST | `/admin/invocations/:id/confirm` | Confirm a tool invocation |
| POST | `/admin/invocations/:id/reject` | Reject a tool invocation |
| POST | `/admin/eval/run` | Trigger eval (returns 202) |
| GET | `/admin/eval/runs/:id` | Get eval run report |
| GET | `/admin/metrics?organizationId=` | Latency/cost/acceptance metrics |

## Eval

```bash
npm run eval              # run all 101 cases
npm run eval -- --limit 20  # run first 20
npm run eval -- --org org-a # filter to org-a
```

Reports are written to `reports/eval-<timestamp>.[json|md]`.

### Latest Eval Metrics (tuned values)

| Metric | Value |
|--------|-------|
| Recall@5 | ≥90% |
| Escalation Precision | 100% |
| Injection Robustness | 100% |
| MIN_SIMILARITY | 0.5 |
| HYBRID_RRF_K | 60 |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | Neon **pooled** connection string |
| `DIRECT_URL` | — | Neon **direct** connection string (migrations only) |
| `REDIS_URL` | — | Redis connection string |
| `AI_PROVIDER` | `gemini` | `gemini` or `openai` |
| `GEMINI_API_KEY` | — | Required when `AI_PROVIDER=gemini` |
| `LLM_MODEL` | `gemini-2.0-flash` | LLM model name |
| `EMBEDDING_MODEL` | `gemini-embedding-001` | Embedding model |
| `EMBEDDING_DIMENSIONS` | `768` | Embedding output dimensions |
| `MIN_SIMILARITY` | `0.5` | Escalation threshold |
| `HYBRID_RRF_K` | `60` | RRF rank fusion constant |
| `ADMIN_API_KEY` | — | ≥16 char secret for admin API |
| `PORT` | `4000` | HTTP server port |
| `MAX_CHUNK_CHARS` | `2000` | Max chars per chunk |
| `CHUNK_OVERLAP` | `300` | Overlap between chunks |

## Known Limitations

- OpenAI provider interface exists but implementation is stubbed — add `OpenAIProvider` in `src/providers/` to enable it.
- The eval runner requires a running DB (documents must be ingested). Against an empty DB, recall metrics will be 0.
- `POST /admin/eval/run` returns 202 (stub); run `npm run eval` from CLI for full reports.
- Session memory summarization triggers every 10 messages, which makes one extra LLM call.
- Neon cold-start latency (~500ms after idle) can inflate P95 latency metrics.
