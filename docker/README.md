# Docker

[← Back to the docs index](../docs/README.md)

The scholarly-mcp image runs the MCP server and the ingest CLI on a distroless, non-root Node 24 base with a read-only filesystem ([ADR 0037](../docs/adr/0037-container-image-and-compose-profiles.md)). `compose.yaml` at the repository root runs it on SQLite or on Postgres. A second image runs the reference landing app behind a proxy ([ADR 0038](../docs/adr/0038-landing-image-proxy-and-secret-files.md)).

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

The landing app: `docker build -f docker/landing/Dockerfile -t scholarly-mcp-landing .` (its own `Dockerfile.dockerignore` keeps `apps/landing` in the context).

## Commands

One entrypoint runs every command, with the same settings and volumes:

| Command                  | What it does                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `serve` (default)        | The MCP server over Streamable HTTP on port 8080                                            |
| `keys create --label …`  | Makes an API key ([operating guide](../docs/guides/operating-the-server.md))                |
| `funnel …`               | The funnel report or its live view ([funnel guide](../docs/guides/funnel-and-card-view.md)) |
| `ingest full`, `verify`… | The ingest CLI ([ingestion guide](../docs/guides/ingestion.md))                             |

## Compose profiles

| Profile    | Services                                                                 | Start                                                            |
| ---------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `sqlite`   | `server` on the `index` and `state` volumes                              | `docker compose --profile sqlite up -d --wait`                   |
| `postgres` | `postgres`, `migrate` (one-shot), `server-pg`                            | `docker compose --profile postgres up -d --wait`                 |
| `tools`    | `ingest`, for one-off ingest commands on SQLite                          | `docker compose --profile tools run --rm ingest full`            |
| `landing`  | `landing` app and `landing-proxy` (Caddy); add to `sqlite` or `postgres` | `docker compose --profile sqlite --profile landing up -d --wait` |

Make a key in the profile you run: `docker compose run --rm server keys create --label me` on SQLite. On Postgres keys are written by the writer role: `docker compose run --rm -e DATABASE_URL=postgres://scholarly_ingest:ingest-local@postgres:5432/scholarly server-pg keys create --label me`.

Settings come from `presets/thieme.env` plus the compose file; put your own values in `.env` next to `compose.yaml`:

| Variable                   | Default                       | Meaning                                                                                   |
| -------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------- |
| `HTTP_PORT`                | `8080`                        | Host port for the MCP endpoint, bound to 127.0.0.1                                        |
| `HTTP_ALLOWED_HOSTS`       | `localhost,127.0.0.1`         | Hostnames clients use to reach the server                                                 |
| `LANDING_API_SECRET_PATH`  | a committed local-only file   | File holding the landing API secret (a compose secret); use a random one beyond localhost |
| `LANDING_PORT`             | `3000`                        | Host port of the landing proxy, bound to 127.0.0.1                                        |
| `LANDING_IMAGE`            | `scholarly-mcp-landing:local` | Use a published landing image instead of building one                                     |
| `LANDING_BASE_URL`         | `http://localhost:3000`       | Where card links point                                                                    |
| `INDEX_DIR`                | none                          | A directory with `index.sqlite` to bake into the image                                    |
| `SCHOLARLY_IMAGE`          | `scholarly-mcp:local`         | Use a published image instead of building one                                             |
| `PG_PORT`, `PG_*_PASSWORD` | `5432`, local-only values     | Postgres, as in the [Postgres guide](../docs/guides/postgres.md)                          |

## What the image guarantees

- Defaults to `AUTH_MODE=api-key`, `HTTP_ALLOWED_HOSTS=localhost,127.0.0.1` and the landing API on port 8081 on loopback, so a bare `docker run` starts and refuses calls without a key; set the hostname clients use in a deployment, and `LANDING_API_HOST` with `LANDING_API_SECRET` to serve a landing app.
- Runs as uid 65532 (`nonroot`); the root filesystem can be mounted read-only. It writes only to `/var/lib/scholarly` (runtime database) and `/data` (index).
- The embedding model is in the image (`/models`) and `EMBEDDER_ALLOW_REMOTE=false`, so it needs no network access to start.
- `/metrics` is served on port 9464 only (`METRICS_PORT`); port 8080 answers 404 for it. Publish 8080, keep 9464 on the internal network.
- In compose the landing API is on port 8081 only (`LANDING_API_PORT`), on the internal `landing-api` network that only the landing app joins; port 8080 answers 404 for it.
- Secrets can be mounted files: `LANDING_API_SECRET_FILE`, `METER_WEBHOOK_SECRET_FILE`, `DATABASE_URL_FILE`.
- SIGTERM drains requests for up to `SHUTDOWN_TIMEOUT_MS` (10 s) and flushes the metering outbox; give the container at least 15 s to stop (compose: 20 s).
- About 200 MB compressed without an index.
