# Docker

[← Back to the docs index](../docs/README.md)

The scholarly-mcp image runs the MCP server and the ingest CLI on a distroless, non-root Node 24 base with a read-only filesystem ([ADR 0037](../docs/adr/0037-container-image-and-compose-profiles.md)). `compose.yaml` at the repository root runs it on SQLite or on Postgres.

## Build

From the repository root:

```bash
docker build -f docker/server/Dockerfile -t scholarly-mcp .
```

To bake an index into the image, pass a directory that holds `index.sqlite` as the `index` build context. A hard link keeps the context small and the copy instant:

```bash
mkdir -p /tmp/scholarly-index && ln -f data/index.sqlite /tmp/scholarly-index/index.sqlite
docker build -f docker/server/Dockerfile --build-context index=/tmp/scholarly-index -t scholarly-mcp .
```

With compose, set `INDEX_DIR=/tmp/scholarly-index` instead.

## Commands

One entrypoint runs every command, with the same settings and volumes:

| Command                  | What it does                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `serve` (default)        | The MCP server over Streamable HTTP on port 8080                                            |
| `keys create --label …`  | Makes an API key ([operating guide](../docs/guides/operating-the-server.md))                |
| `funnel …`               | The funnel report or its live view ([funnel guide](../docs/guides/funnel-and-card-view.md)) |
| `ingest full`, `verify`… | The ingest CLI ([ingestion guide](../docs/guides/ingestion.md))                             |

## Compose profiles

| Profile    | Services                                        | Start                                                 |
| ---------- | ----------------------------------------------- | ----------------------------------------------------- |
| `sqlite`   | `server` on the `index` and `state` volumes     | `docker compose --profile sqlite up -d --wait`        |
| `postgres` | `postgres`, `migrate` (one-shot), `server-pg`   | `docker compose --profile postgres up -d --wait`      |
| `tools`    | `ingest`, for one-off ingest commands on SQLite | `docker compose --profile tools run --rm ingest full` |

Make a key in the profile you run: `docker compose run --rm server keys create --label me` on SQLite. On Postgres keys are written by the writer role: `docker compose run --rm -e DATABASE_URL=postgres://scholarly_ingest:ingest-local@postgres:5432/scholarly server-pg keys create --label me`.

Settings come from `presets/thieme.env` plus the compose file; put your own values in `.env` next to `compose.yaml`:

| Variable                   | Default                   | Meaning                                                          |
| -------------------------- | ------------------------- | ---------------------------------------------------------------- |
| `HTTP_PORT`                | `8080`                    | Host port for the MCP endpoint, bound to 127.0.0.1               |
| `HTTP_ALLOWED_HOSTS`       | `localhost,127.0.0.1`     | Hostnames clients use to reach the server                        |
| `LANDING_API_SECRET`       | a local-only value        | Shared with the landing app; set a random one beyond localhost   |
| `LANDING_BASE_URL`         | `http://localhost:3000`   | Where card links point                                           |
| `INDEX_DIR`                | none                      | A directory with `index.sqlite` to bake into the image           |
| `SCHOLARLY_IMAGE`          | `scholarly-mcp:local`     | Use a published image instead of building one                    |
| `PG_PORT`, `PG_*_PASSWORD` | `5432`, local-only values | Postgres, as in the [Postgres guide](../docs/guides/postgres.md) |

## What the image guarantees

- Runs as uid 65532 (`nonroot`); the root filesystem can be mounted read-only. It writes only to `/var/lib/scholarly` (runtime database) and `/data` (index).
- The embedding model is in the image (`/models`) and `EMBEDDER_ALLOW_REMOTE=false`, so it needs no network access to start.
- `/metrics` is served on port 9464 only (`METRICS_PORT`); port 8080 answers 404 for it. Publish 8080, keep 9464 on the internal network.
- SIGTERM drains requests for up to `SHUTDOWN_TIMEOUT_MS` (10 s) and flushes the metering outbox; give the container at least 15 s to stop (compose: 20 s).
- About 200 MB compressed without an index.
