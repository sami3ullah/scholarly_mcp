# Operations

[← Docs index](README.md) · [Main README](../README.md)

How to deploy, refresh, scale and watch scholarly-mcp. Settings for auth, keys, rate limits, metering and probes are in the [operating guide](guides/operating-the-server.md); the image and compose details in [docker/README.md](../docker/README.md).

## Deploy

One image, `ghcr.io/sami3ullah/scholarly-mcp`, runs the server and every command (`serve`, `keys`, `funnel`, `ingest`). Release images carry the CC BY demo index ([ADR 0039](adr/0039-demo-index-from-a-cc-by-doi-list.md)); for the real corpus, build an index with `ingest full` or bake one into a private image ([docker/README.md](../docker/README.md#build)).

| Need               | Set                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| Public hostname    | `HTTP_ALLOWED_HOSTS=mcp.example.org` (and `HTTP_ALLOWED_ORIGINS` for browser clients)                  |
| Auth               | `AUTH_MODE=api-key` (image default) or `oauth` with `OAUTH_ISSUER`, `OAUTH_AUDIENCE`, `OAUTH_JWKS_URL` |
| Card links         | `LANDING_BASE_URL` to your landing page ([LANDING.md](LANDING.md))                                     |
| Publisher settings | the preset, e.g. `--env-file presets/thieme.env`                                                       |
| Runtime state      | a volume at `/var/lib/scholarly` (SQLite) or `STORE=postgres` with `DATABASE_URL`                      |
| Secrets            | `LANDING_API_SECRET_FILE`, `METER_WEBHOOK_SECRET_FILE`, `DATABASE_URL_FILE` from the secret store      |
| Usage export       | `METER_WEBHOOK_URL` and its secret ([operating guide](guides/operating-the-server.md#usage-metering))  |

Publish port 8080 behind a TLS-terminating proxy; keep 9464 (`/metrics`) and 8081 (landing API, when `LANDING_API_PORT` is set) on the internal network. Probe `/healthz` for liveness and `/readyz` for readiness, and give the container at least 15 s to stop (`SHUTDOWN_TIMEOUT_MS` plus 5 s), so requests in flight drain and the usage outbox is flushed.

```bash
docker run -d --name scholarly-mcp --read-only --tmpfs /tmp \
  -p 127.0.0.1:8080:8080 -v scholarly-state:/var/lib/scholarly \
  --env-file presets/thieme.env -e HTTP_ALLOWED_HOSTS=mcp.example.org \
  ghcr.io/sami3ullah/scholarly-mcp:latest
docker exec scholarly-mcp /nodejs/bin/node /app/scholarly-mcp.mjs keys create --label acme
```

Verify an image before you run it: `gh attestation verify oci://ghcr.io/sami3ullah/scholarly-mcp:<version> --owner sami3ullah`. Each release also carries an SPDX SBOM per image.

## Keep the index fresh

Ingestion is the only writer ([ADR 0008](adr/0008-ingestion-is-the-only-writer.md)). Run `ingest incremental` on a schedule, e.g. hourly; it turns into a full run every `INGEST_FULL_RUN_DAYS` (7) so embargoed licences open ([ingestion guide](guides/ingestion.md)). Every run builds next to the live index, verifies it and swaps it in only when it passes; a failed run leaves the live index untouched. The server picks up a new index within `INDEX_REFRESH_MS` (30 s) without a restart.

```bash
# SQLite: the same volumes as the server
docker run --rm -v scholarly-index:/data -v scholarly-state:/var/lib/scholarly \
  --env-file presets/thieme.env ghcr.io/sami3ullah/scholarly-mcp ingest incremental
```

Set `CROSSREF_MAILTO` so Crossref serves the polite pool. A first full run of the Thieme corpus (about 71,000 articles) takes a few hours, mostly embedding.

## Scale

| Setup                       | Replicas | Notes                                                                                                                                                                                                         |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQLite (default)            | 1        | Index and runtime files on one volume. Enough for a pilot; see the capacity numbers below.                                                                                                                    |
| Postgres (`STORE=postgres`) | many     | Sessions, keys, usage outbox and rate-limit buckets are shared, so replicas behind a load balancer agree ([ADR 0034](adr/0034-postgres-store-adapter.md), [ADR 0036](adr/0036-shared-rate-limit-buckets.md)). |

Each replica holds the embedding model and runs queries on its own CPU, so throughput grows with replicas until the database is the limit. Keep `PG_POOL_MAX` times the replica count under the database's connection limit.

## Capacity

Measured with `docker/e2e/load.sh` (autocannon, 10 connections, a fixed rate of tool calls: seven in ten `search_articles`, the rest `get_article` and `find_related`).

Full Thieme index (70,989 articles, 176,536 chunks), 60 s per run, on an Apple M4 Max under Docker Desktop, 2026-11-03:

| Setup                                                 | Offered/s | Served/s | p50 ms | p95 ms | p99 ms |                             Errors |
| ----------------------------------------------------- | --------: | -------: | -----: | -----: | -----: | ---------------------------------: |
| Postgres; server 2 vCPUs, Postgres 4 vCPUs            |        20 |     20.0 |     74 |    299 |    377 |                                  0 |
| Postgres; server 2 vCPUs, Postgres 2 vCPUs            |        20 |     19.6 |    182 |    809 |  1,201 |                                  0 |
| Postgres; no CPU limits                               |        20 |     19.9 |     61 |    201 |    908 |                                  0 |
| SQLite, one container                                 |         1 |      1.0 |    283 |    470 |    690 |                                  0 |
| SQLite, one container                                 |         4 |      4.0 |    625 |  1,125 |  1,376 |                                  0 |
| SQLite, one container                                 |        20 |      4.4 |  2,413 |  3,380 |  4,350 | 8 tool errors (codes not recorded) |
| SQLite 0.1.0; 2 vCPUs                                 |        20 |      4.4 |  2,338 |  3,527 |  5,043 |                       13 `TIMEOUT` |
| SQLite, L2 scan (ADR 0040); 2 vCPUs                   |        20 |     12.5 |    786 |  1,103 |  2,585 |                        5 `TIMEOUT` |
| SQLite, L2 scan (ADR 0040); no CPU limits             |        20 |     13.0 |    780 |  1,075 |  1,567 |                                  0 |
| SQLite, 1 search worker; 2 vCPUs                      |        20 |     12.8 |    860 |  1,023 |  1,454 |                                  0 |
| SQLite, 2 search workers (default, ADR 0041); 2 vCPUs |        20 |     19.4 |    344 |    517 |    900 |                        1 `TIMEOUT` |
| SQLite, 3 search workers; 2 vCPUs                     |        20 |     19.8 |    345 |    525 |    837 |                                  0 |

- **Postgres meets the plan's target** (20 requests a second, p95 under 500 ms on a 2-vCPU server) when the database has 4 vCPUs. The server itself stays near 15% of one CPU at 20 calls a second; Postgres does the search work and is what to size.
- **SQLite serves about 20 calls a second on 2 vCPUs, at the edge.** A search costs about 50 ms natively and about 100 ms of CPU in the Linux image (it was 200 ms, mostly the exact vector scan; [ADR 0040](adr/0040-sqlite-vector-scan-by-euclidean-distance.md)), and runs on `SQLITE_SEARCH_WORKERS` threads (default 2) instead of the event loop ([ADR 0041](adr/0041-sqlite-search-on-worker-threads.md)). At 20 a second the 2 vCPUs are saturated and p95 sits near 500 ms; past it calls queue and some hit the 2 s search budget (`TIMEOUT`). For steady load at that rate give the server 3 vCPUs and 3 workers, or use Postgres. `LOAD_CPUS=2` limits the server container in `load.sh`, and `SQLITE_SEARCH_WORKERS` is passed on.
- **Cold start** to ready: 1.2 to 1.9 s on the full SQLite index, about 1.8 s on the eval index.
- **Memory:** the server holds about 560 MiB when ready (mostly the model) and 590 to 700 MiB under load on Postgres; Postgres about 250 MiB at this load. On SQLite the index file is mapped into memory (ADR 0040), and the pages it reads count as the container's file cache: about 1.3 GiB after a load run on the full index, 1.4 GiB with the two search workers. Give a Postgres server 1 GiB and a SQLite server 1 GiB plus the index file size.

The fuzz tests (`apps/server/src/http/http-edge.fuzz.test.ts`) and the E2E smoke test (`docker/e2e/smoke.sh`, in CI on both stores) cover correctness; these numbers cover load.

## Watch

`/metrics` on port 9464 ([operating guide](guides/operating-the-server.md#health-metrics-and-traces)). Worth alerting on:

| Signal                                                               | Meaning                                                     |
| -------------------------------------------------------------------- | ----------------------------------------------------------- |
| `index_ready == 0` for more than a minute                            | No index open: the server answers `503` on `/readyz`        |
| p95 of `mcp_tool_duration_seconds{tool="search_articles"}` above 1 s | Overloaded, or the host is short of CPU                     |
| `mcp_tool_calls_total{status!="ok"}` rate rising                     | Errors by code; `RATE_LIMITED` means a caller hit its limit |
| `auth_failures_total` rate rising                                    | Bad or revoked keys, or someone guessing                    |
| `meter_outbox_pending` growing, `meter_export_failures_total` rising | The billing webhook is down; events wait in the outbox      |
| `meter_events_dropped_total` above 0                                 | Usage events lost: investigate at once                      |
| An ingest run exiting non-zero                                       | The live index is unchanged but getting stale               |

Logs are JSON lines on stdout, with query text and secrets redacted. Traces go to `OTEL_EXPORTER_OTLP_ENDPOINT` when set.

## Back up

| Data                                     | Where                                           | Back up?                                         |
| ---------------------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| API keys, landing sessions, usage outbox | `runtime.sqlite` or the Postgres runtime tables | Yes: keys and unexported usage cannot be rebuilt |
| The index                                | `index.sqlite` or the Postgres build schemas    | Optional: `ingest full` rebuilds it, in hours    |

For SQLite, copy `runtime.sqlite` with `sqlite3 runtime.sqlite ".backup backup.sqlite"` rather than copying the file under a running server.

## Upgrade and roll back

Release tags (`v1.2.3`) publish `1.2.3`, `1.2` and `latest`. Pin a version in production. Runtime migrations run on start for SQLite and with `ingest migrate` for Postgres, and only add, so the previous version keeps working on a migrated database: roll back by running the previous tag. An index built with another embedding model is refused and the current one stays open.

## Troubleshooting

| Symptom                                                       | Cause and fix                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Exits at start with `AUTH_MODE: HTTP beyond loopback needs …` | Set `AUTH_MODE=api-key` or `oauth`, and `HTTP_ALLOWED_HOSTS`                                      |
| `421` or `403` from `/mcp`                                    | The `Host` or `Origin` the client sends is not on `HTTP_ALLOWED_HOSTS` / `HTTP_ALLOWED_ORIGINS`   |
| `/readyz` stays `503`                                         | No index at `INDEX_PATH` or no live Postgres build: bake one in, run `ingest full` or `copy`      |
| `401` with a key you just made                                | The key was made against another runtime database than the server uses (volume or `DATABASE_URL`) |
| Card links open the wrong host                                | `LANDING_BASE_URL`                                                                                |

More for Postgres in its [guide](guides/postgres.md#troubleshooting).
