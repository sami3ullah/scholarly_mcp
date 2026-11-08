# Docker

[← Back to the docs index](../docs/README.md)

The scholarly-mcp image runs the MCP server and the ingest CLI on a distroless, non-root Node 24 base with a read-only filesystem ([ADR 0037](../docs/adr/0037-container-image-and-compose-profiles.md)). `compose.yaml` at the repository root runs it on SQLite or on Postgres. A second image runs the reference landing app behind a proxy ([ADR 0038](../docs/adr/0038-landing-image-proxy-and-secret-files.md)). These files are for development and tests; a production deployment uses the published images through `deploy/` ([self-hosting guide](../docs/SELF-HOSTING.md), [ADR 0045](../docs/adr/0045-self-hosting-bundle.md)).

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
| `funnel …`               | The funnel report or its live view ([funnel guide](../docs/guides/funnel-and-card-view.md)) |
| `ingest full`, `verify`… | The ingest CLI ([ingestion guide](../docs/guides/ingestion.md))                             |

## Compose profiles

| Profile    | Services                                                                 | Start                                                            |
| ---------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `sqlite`   | `server` on the `index` and `state` volumes                              | `docker compose --profile sqlite up -d --wait`                   |
| `postgres` | `postgres`, `migrate` (one-shot), `server-pg`                            | `docker compose --profile postgres up -d --wait`                 |
| `tools`    | `ingest`, for one-off ingest commands on SQLite                          | `docker compose --profile tools run --rm ingest full`            |
| `landing`  | `landing` app and `landing-proxy` (Caddy); add to `sqlite` or `postgres` | `docker compose --profile sqlite --profile landing up -d --wait` |

The MCP endpoint needs no key: connect a client to `http://localhost:8080/mcp` ([ADR 0048](../docs/adr/0048-public-server-without-auth.md)).

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

## Demo index

The published image carries a small index of CC BY 4.0 articles, never the full index ([ADR 0039](../docs/adr/0039-demo-index-from-a-cc-by-doi-list.md)). Build it with the image (a few minutes, needs the internet), then bake it in:

```bash
docker build -f docker/server/Dockerfile -t scholarly-mcp:local .
docker/demo-index/build.sh /tmp/demo-index          # ingest of presets/thieme.demo-dois.txt, then a licence check
INDEX_DIR=/tmp/demo-index docker compose --profile sqlite build
```

## Tests

| Script                                          | What it does                                                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `docker/e2e/smoke.sh [sqlite\|postgres]`        | Both images with the demo index, the stack with the landing app, every tool over HTTP, a card link via the proxy  |
| `docker/e2e/deploy-smoke.sh [sqlite\|postgres]` | The self-hosting bundle (`deploy/`) on those images, `PUBLIC_HOST=localhost`, every tool over HTTPS through Caddy |
| `docker/e2e/load.sh <dir with index.sqlite>`    | Cold start, then tool calls at `LOAD_RATE` (20) a second for `LOAD_SECONDS` (60): p50/p95/p99, errors, memory     |

The smoke test builds the demo index first unless `SMOKE_INDEX_DIR` names one; `SMOKE_KEEP=1` leaves the stack up. CI runs both scripts on both stores. Load results are in [OPERATIONS.md](../docs/OPERATIONS.md#capacity).

## Releases

Pushing a tag `v1.2.3` runs `.github/workflows/release.yml`: it builds the demo index, smoke-tests it on SQLite and Postgres, then pushes both images for amd64 and arm64 to `ghcr.io/<owner>/scholarly-mcp` and `ghcr.io/<owner>/scholarly-mcp-landing` (tags `1.2.3`, `1.2`, `latest`) with build provenance, and attaches an SPDX SBOM of each to the GitHub release.

## What the image guarantees

- Defaults to a public MCP endpoint ([ADR 0048](../docs/adr/0048-public-server-without-auth.md)), `HTTP_ALLOWED_HOSTS=localhost,127.0.0.1` and the landing API on port 8081 on loopback, so a bare `docker run -p 8080:8080` starts and answers tool calls with no key, rate limited per client address; set the hostname clients use in a deployment, `HTTP_TRUSTED_PROXIES` behind a proxy, and `LANDING_API_HOST` with `LANDING_API_SECRET` to serve a landing app.
- Runs as uid 65532 (`nonroot`); the root filesystem can be mounted read-only. It writes only to `/var/lib/scholarly` (runtime database) and `/data` (index).
- The embedding model is in the image (`/models`) and `EMBEDDER_ALLOW_REMOTE=false`, so it needs no network access to start.
- `/metrics` is served on port 9464 only (`METRICS_PORT`); port 8080 answers 404 for it. Publish 8080, keep 9464 on the internal network.
- In compose the landing API is on port 8081 only (`LANDING_API_PORT`), on the internal `landing-api` network that only the landing app joins; port 8080 answers 404 for it.
- Secrets can be mounted files: `LANDING_API_SECRET_FILE`, `METER_WEBHOOK_SECRET_FILE`, `DATABASE_URL_FILE`.
- SIGTERM drains requests for up to `SHUTDOWN_TIMEOUT_MS` (10 s) and flushes the metering outbox; give the container at least 15 s to stop (compose: 20 s).
- About 200 MB compressed without an index.
