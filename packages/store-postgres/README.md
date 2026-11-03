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

| Schema      | Tables                                                                                    | Written by                                                        |
| ----------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `scholarly` | `migrations`, `landing_sessions`, `api_keys`, `usage_events`, `live_index`, `index_build` | migrations; server for sessions and events; keys command for keys |

Runtime migrations are versioned and append-only, and run under an advisory lock (`migrateDatabase`). The server does not migrate: it checks the version with `assertMigrated`.
