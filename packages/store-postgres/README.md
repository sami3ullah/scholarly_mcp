# @scholarly-mcp/store-postgres

The production store (key design decision 4, ADR 0034): the same ports as `store-sqlite`, on Postgres with `pgvector`. It passes the same testkit contracts, run on Testcontainers with the pinned `pgvector/pgvector:0.8.7-pg18-trixie` image (Docker must be running for its tests).

## Configuration

| Variable                  | Default  | Meaning                                                                     |
| ------------------------- | -------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`            | required | `postgres://` connection string; its role decides what the process may do   |
| `PG_POOL_MAX`             | `10`     | Connections per process                                                     |
| `PG_STATEMENT_TIMEOUT_MS` | `15000`  | Longest a single statement may run                                          |
| `PG_SERVER_ROLE`          | unset    | Role the ingest grants the server's access to (runtime tables, live builds) |

## Schema

| Schema             | Tables                                                                                    | Written by                                                        |
| ------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `scholarly`        | `migrations`, `landing_sessions`, `api_keys`, `usage_events`, `live_index`, `index_build` | migrations; server for sessions and events; keys command for keys |
| `index_<build id>` | `layout`, `articles`, `chunks`, `index_meta`, `sync_state`                                | the ingest, while the build is in progress                        |

Runtime migrations are versioned and append-only, and run under an advisory lock (`migrateDatabase`). Migration 2 creates the `vector` and `pg_trgm` extensions, which may need a superuser; the `postgres` compose profile creates them up front ([Postgres guide](../../docs/guides/postgres.md)). Migration 3 indexes `usage_events` by `(occurred_at, id)` for the outbox's `list`, which the live funnel pages through (ADR 0035). The server does not migrate: it checks the version with `assertMigrated`.

## Index builds

Each build is its own schema (ADR 0034). `beginPostgresIndexBuild` starts a full build in an empty schema, or an incremental or purge build from a copy of the live one, and resumes a leftover build of the same kind, layout and vector size. `verifyPostgresIndex` runs the same checks as the SQLite verify, plus the layout and the four search indexes. `commit` writes the `IndexMeta`, grants `PG_SERVER_ROLE` `SELECT` on the build, points `scholarly.live_index` at it and drops the schema before the previous one, in one transaction. Index schemas are never migrated: a new `INDEX_LAYOUT_VERSION` needs a full build.

`createPostgresIndexStorage({ pool, serverRole })` wraps these builds in core's `IndexStorage` port, the one the ingest uses for both stores, and `openPostgresIndexReader(pool, modelVersion, signal)` is the server's reader: it follows `live_index` on each `refresh` and refuses a build of another model or layout. Both pass testkit's `runIndexStorageContract`, as the SQLite ones do.

Each chunk row carries its article's filter columns and the text forms written by `packages/lexical`, so both searches read one table:

| Search  | Column and index                                                                                                                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lexical | generated `tsv` (`simple` config; title A, stemmed text B, folded text C) with GIN; `to_tsquery` per tokenised word; each word's `ts_rank` (weights 1.0 / 0.5 / 0.25, no length normalisation) times its BM25 IDF, summed |
| Top-up  | `title_text_folded` with a `pg_trgm` GIN index; `LIKE` on stems, kept only at compound edges                                                                                                                              |
| Vector  | `embedding vector(<dimensions>)` with HNSW on cosine; `iterative_scan = strict_order`, `ef_search` 400, `max_scan_tuples` 1,000,000                                                                                       |
