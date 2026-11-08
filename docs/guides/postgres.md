# Running on Postgres

[← Back to the docs index](../README.md)

SQLite is the default and needs nothing set up. Postgres is for production: several server replicas share one index, landing sessions and usage events, and the database can be a managed service. Both stores rank alike: on the golden set they are within a point of each other, and Postgres answers faster. The design is in [ADR 0034](../adr/0034-postgres-store-adapter.md); tables and builds are in the [store's README](../../packages/store-postgres/README.md).

## Start one locally

The `postgres` compose profile runs the pinned `pgvector/pgvector:0.8.7-pg18-trixie` image on `127.0.0.1:5432`. On first start it creates the database `scholarly`, both roles and the `vector` and `pg_trgm` extensions ([init script](../../docker/postgres/init/01-roles-and-extensions.sh)).

```bash
docker compose --profile postgres up -d --wait
```

Passwords default to local-only values. Set `PG_SUPERUSER_PASSWORD`, `PG_INGEST_PASSWORD` and `PG_SERVER_PASSWORD` (and `PG_PORT` to move the port) in `.env` before the first start for anything else; the init script runs only on an empty volume, so `docker compose --profile postgres down -v` starts over.

## Roles

Each process connects with the least it needs (ADR 0034 decision 7). `DATABASE_URL` names the role.

| Role               | Used by            | May                                                                                                             |
| ------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `scholarly_ingest` | `ingest`           | Owns the database: runs migrations, creates a schema per build                                                  |
| `scholarly_server` | the server, `eval` | Reads live builds and the index pointer; reads and writes landing sessions, usage events and rate-limit buckets |

The server role gets its grants from `ingest migrate` (runtime tables) and from each committed build (the build's schema), so name it in `PG_SERVER_ROLE` for the ingest. A build in progress stays invisible to it.

## Load an index

Prepare the database once, and again after every upgrade; it is safe to run twice:

```bash
export STORE=postgres PG_SERVER_ROLE=scholarly_server
export DATABASE_URL=postgres://scholarly_ingest:ingest-local@127.0.0.1:5432/scholarly
pnpm ingest migrate
```

Then either copy an index you already have, which fetches and embeds nothing:

```bash
pnpm ingest copy --from data/index.sqlite
```

or build one from Crossref, as on SQLite ([ingestion guide](ingestion.md)):

```bash
pnpm ingest full
```

`copy` brings the articles, their chunks and embeddings and the sync state, so the next `pnpm ingest incremental` carries on where the SQLite index left off. It needs the source built with `EMBEDDER_MODEL`, and it replaces the live index only when every article arrived and the copy verifies. The 2,959 articles of the eval index take about 35 s; the 70,911 of the Thieme corpus (176k chunks) about 8 minutes.

Every other command works the same with `STORE=postgres`: `incremental`, `verify`, `purge-license`. `subset` and `reembed` read and write SQLite files whatever `STORE` says.

## Run the server

```bash
STORE=postgres DATABASE_URL=postgres://scholarly_server:server-local@127.0.0.1:5432/scholarly \
  MCP_TRANSPORT=http EMBEDDER_CACHE_DIR=.cache/models \
  node --env-file=presets/thieme.env apps/server/dist/main.js
```

At start the server checks that the database is migrated, and refuses to start otherwise (`run "ingest migrate" first`). It follows each committed build on its refresh tick (`INDEX_REFRESH_MS`), as it reopens a swapped SQLite file, and refuses a build of another embedding model while it keeps serving the current one. After an upgrade, run `ingest migrate` again before the servers start: it is idempotent. Replicas share one rate limit per client address and per landing visitor through `scholarly.rate_buckets`, an unlogged table ([ADR 0036](../adr/0036-shared-rate-limit-buckets.md)). The live funnel reads `scholarly.usage_events` as the server role (`funnel --store --serve`, [The funnel and the card view](funnel-and-card-view.md#the-live-view)).

## Configuration

| Variable                  | Default  | Meaning                                                                         |
| ------------------------- | -------- | ------------------------------------------------------------------------------- |
| `STORE`                   | `sqlite` | `sqlite` or `postgres`, for the server, the ingest and the eval                 |
| `DATABASE_URL`            | required | `postgres://` connection string; its role decides what the process may do       |
| `PG_POOL_MAX`             | `10`     | Connections per process                                                         |
| `PG_STATEMENT_TIMEOUT_MS` | `15000`  | Longest a single statement may run; builds run without it                       |
| `PG_SERVER_ROLE`          | unset    | For the ingest: the role granted the server's access at migrate and each commit |

## Your own Postgres

Any Postgres with pgvector 0.8 or later works (iterative index scans need 0.8). A superuser creates the roles and extensions once, as the init script does:

```sql
CREATE ROLE scholarly_ingest LOGIN PASSWORD '…';
CREATE ROLE scholarly_server LOGIN PASSWORD '…';
CREATE DATABASE scholarly OWNER scholarly_ingest;
REVOKE ALL ON DATABASE scholarly FROM PUBLIC;
GRANT CONNECT ON DATABASE scholarly TO scholarly_server;
\connect scholarly
CREATE EXTENSION vector;
CREATE EXTENSION pg_trgm;
```

Leave room for three copies of the index: the live one, the one before it (kept so running queries finish) and the build. An incremental run copies the live schema first. Raise `maintenance_work_mem` (the compose profile uses 512 MB) so the HNSW index of a full build is made in memory.

## Search on Postgres

The same `packages/lexical` stemmer writes both stores, so a word matches the same way in either. Lexical matches are ranked by `ts_rank` per query word, weighed by how rare the word is, as BM25 does; vectors are searched with HNSW (`ef_search` 400, filters applied during the scan). Measured on the eval index (golden set version 2, 60 queries):

| Store    | Recall@10 | MRR   | nDCG@10 | Search p50 / p95 on the full corpus |
| -------- | --------- | ----- | ------- | ----------------------------------- |
| SQLite   | 0.680     | 0.888 | 0.627   | 221 / 312 ms                        |
| Postgres | 0.684     | 0.881 | 0.633   | 68 / 259 ms                         |

Words in more than 5 % of chunks still add to the score but do not pick candidates, which keeps a query with "patients" from ranking a third of the corpus. The measurements and what was tried are in ADR 0034's exit eval. To run the golden set on Postgres, as the server role:

```bash
STORE=postgres DATABASE_URL=postgres://scholarly_server:server-local@127.0.0.1:5432/scholarly \
  LOG_LEVEL=warn EMBEDDER_CACHE_DIR=.cache/models pnpm eval golden --show
```

## Troubleshooting

| Message                                                                  | What to do                                                                                    |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `The database schema is at version 0, not 5; run "ingest migrate" first` | Run `pnpm ingest migrate` as the writer, then start the server                                |
| `permission denied to create extension "vector"`                         | Create the extensions as a superuser first (above); the migration then skips them             |
| `INDEX_UNAVAILABLE` from the server or `eval`                            | No build is live yet, or it was made with another `EMBEDDER_MODEL`; run `copy` or `full`      |
| `permission denied for schema index_…`                                   | The build was committed without `PG_SERVER_ROLE`; set it and run `pnpm ingest full` or `copy` |
