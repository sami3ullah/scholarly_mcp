# SM-13 Postgres adapter (Phase 5)

## Tasks
- [ ] `packages/store-postgres`: versioned migrations, `tsv` generated column with per-row regconfig, GIN; `vector(384)` HNSW cosine
- [ ] `websearch_to_tsquery`; read-only server role, write role for ingestion
- [ ] Store contract suite on Testcontainers (pgvector image)
- [ ] `docker compose --profile postgres`

## Exit
Golden-set results within 2 points of SQLite.
