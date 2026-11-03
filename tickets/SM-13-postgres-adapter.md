# SM-13 Postgres adapter (Phase 5)

## Tasks

- [ ] `packages/store-postgres`: versioned migrations, `tsv` generated column with per-row regconfig, GIN; `vector(384)` HNSW cosine
- [ ] `websearch_to_tsquery`; read-only server role, write role for ingestion
- [ ] Store contract suite on Testcontainers (pgvector image)
- [ ] `docker compose --profile postgres`
- [x] Postgres `ApiKeyStore` and `UsageOutbox` passing the testkit contracts; claim outbox rows (`FOR UPDATE SKIP LOCKED`) so several exporters do not resend each other's batches (ADR 0031)
- [x] Outbox rows as envelope plus `jsonb` payload, like SQLite runtime migration 3, so all three event kinds fit; sessions keep their `tool` (ADR 0033)
- [ ] Follow-up from SM-12: a live funnel view once events sit in Postgres (the `funnel` CLI reads the JSON lines export today)
- [x] Postgres `SessionStore` passing the session contract, so landing links work across replicas (ADR 0032)

Design: ADR 0034. Done so far: shared `packages/lexical` stemmer, outbox `claim`/`release` port (SQLite runtime migration 4), Postgres runtime migrations and runtime stores. Server wiring of the Postgres runtime stores is part of the store-selection step.

## Exit

Golden-set results within 2 points of SQLite.
