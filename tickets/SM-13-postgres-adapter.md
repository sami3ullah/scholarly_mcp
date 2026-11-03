# SM-13 Postgres adapter (Phase 5)

## Tasks

- [x] `packages/store-postgres`: versioned migrations, `tsv` generated column, GIN; `vector(<dimensions>)` HNSW cosine (ADR 0034 replaces the per-row regconfig with the shared `packages/lexical` stemmer and a `simple` config)
- [x] ~~`websearch_to_tsquery`~~ (not needed: raw input never reaches the store, ADR 0034 decision 3); read-only server role, write role for ingestion
- [x] Store contract suite on Testcontainers (pgvector image): article, sync state, session, API key and outbox contracts, plus builds and verify
- [x] `STORE=sqlite|postgres` in the server, the ingest (`ingest migrate`) and the eval, with the server's index reader asynchronous for both stores and one `IndexStorage` port for the ingest's builds
- [x] `docker compose --profile postgres`: pgvector image, the writer and server roles and both extensions made on first start; Postgres guide
- [x] `ingest copy --from <index>` loads an existing SQLite index into the configured store, with embeddings and sync state
- [x] Postgres `ApiKeyStore` and `UsageOutbox` passing the testkit contracts; claim outbox rows (`FOR UPDATE SKIP LOCKED`) so several exporters do not resend each other's batches (ADR 0031)
- [x] Outbox rows as envelope plus `jsonb` payload, like SQLite runtime migration 3, so all three event kinds fit; sessions keep their `tool` (ADR 0033)
- [ ] Follow-up from SM-12: a live funnel view once events sit in Postgres (the `funnel` CLI reads the JSON lines export today)
- [x] Postgres `SessionStore` passing the session contract, so landing links work across replicas (ADR 0032)

Design: ADR 0034. Done so far: shared `packages/lexical` stemmer, outbox `claim`/`release` port (SQLite runtime migration 4), Postgres runtime migrations and runtime stores, the Postgres index store with schema-per-build builds and verify. Store selection: the server, ingest and eval pick the adapter with `STORE`; the keys command uses the writer URL.

## Exit

Golden-set results within 2 points of SQLite.

Met on 2026-11-03: overall recall@10 0.684 vs 0.680, MRR 0.881 vs 0.888, nDCG@10 0.633 vs 0.627; full-corpus search p95 259 ms vs 312 ms (ADR 0034, exit eval).
