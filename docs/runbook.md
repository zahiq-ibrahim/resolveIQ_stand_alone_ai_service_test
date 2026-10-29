# ResolveIQ AI Service — Runbook

## Redeployment

1. Pull latest code.
2. `npm ci` — install exact locked dependencies.
3. `npm run typecheck` — verify no type errors.
4. `npm run migrate` — apply any new SQL migrations (idempotent; safe to run multiple times).
5. Restart the API: `npm run api`
6. Restart the worker: `npm run worker`

### Environment checklist before deploy

| Variable | Expected |
|----------|----------|
| `DATABASE_URL` | Neon pooled URL (contains `-pooler`) |
| `DIRECT_URL` | Neon direct URL (no `-pooler`) |
| `REDIS_URL` | Redis/Upstash connection string |
| `ADMIN_API_KEY` | ≥32 random chars |
| `GEMINI_API_KEY` | Valid Gemini key |
| `LLM_MODEL` | `gemini-2.0-flash` (or override) |

## Running Eval Before Releases

Run the full eval suite to check for regressions before every non-trivial release:

```bash
npm run seed     # ensure seeded data is current
npm run eval     # runs all 101 cases, prints metrics, writes reports/
```

The eval exits non-zero if:
- `recall@5 < 90%`
- Any `mustEscalate` case generated an answer (escalation precision < 100%)
- Any injection/cross-org case leaked content

If recall drops, tune `MIN_SIMILARITY` (raise it to escalate more aggressively) or
`HYBRID_RRF_K` (lower to weight exact keyword matches more). Record the final values in README.

## Inspecting Failed Ingestion Jobs

1. Check BullMQ dashboard or logs: `npm run worker` shows per-job status.
2. Check document state:
   ```sql
   SELECT id, title, status, last_error, attempts FROM documents WHERE status = 'failed';
   ```
3. Retry manually via API:
   ```bash
   curl -X POST http://localhost:4000/admin/documents/<id>/reindex \
     -H "x-admin-key: $ADMIN_API_KEY"
   ```
4. Or re-queue all failed documents:
   ```sql
   UPDATE documents SET status = 'queued', last_error = NULL WHERE status = 'failed';
   ```
   Then restart the worker (it sweeps for stuck docs on startup).

## Swapping AI Provider

To switch from Gemini to OpenAI:

1. Update `.env`:
   ```env
   AI_PROVIDER=openai
   OPENAI_API_KEY=sk-...
   LLM_MODEL=gpt-4o
   EMBEDDING_MODEL=text-embedding-3-small
   EMBEDDING_DIMENSIONS=1536
   ```
2. Implement `OpenAIProvider` and `OpenAIEmbedder` in `src/providers/` (see ADR 0001).
3. Add `case "openai"` to `src/providers/registry.ts`.
4. Re-run migrations if `EMBEDDING_DIMENSIONS` changed (requires re-embedding all documents).
5. Run `npm run seed` and `npm run eval` to verify recall metrics.

## Redis Issues

- **Local dev:** `docker compose up -d redis`
- **Production:** Use Upstash Redis. Set `REDIS_URL=rediss://...` (note `rediss://` for TLS).
- **BullMQ jobs stuck:** Check Redis connectivity. Restart worker after Redis recovers.
- **Queue backlog:** Monitor via BullMQ dashboard (add `bull-board` package if needed).

## Neon / Database Issues

- Neon suspends idle computes. The first query after idle may take ~500ms — this is normal.
- If migrations fail: check you're using `DIRECT_URL` (not the pooled URL).
- Pool exhaustion: `pool.max` is capped at 10. Check for connection leaks (transactions not released).
- Never run `LISTEN`/`NOTIFY` on Neon — it is not supported.
