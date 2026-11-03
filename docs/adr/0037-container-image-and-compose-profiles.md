# 0037 Container image and compose profiles

- Status: accepted
- Date: 2026-11-03
- Records: SM-14; builds on ADR 0031 (shutdown, metrics), ADR 0034 (Postgres roles), ADR 0036 (shared buckets)

## Context

The plan asks for a non-root distroless image with a read-only filesystem, its size checked, compose with SQLite and Postgres profiles, and a prebuilt index in the image. The server has native dependencies (better-sqlite3, sqlite-vec, ONNX Runtime, sharp through transformers.js) and loads a 135 MB model. ADR 0031 left `/metrics` on the public port, and ADR 0034 runs the ingest's `migrate` before Postgres servers start.

## Decision

1. **One image, both apps.** `docker/server/Dockerfile` builds the server and the ingest CLI. A small entrypoint dispatches `serve` (default), `keys …`, `funnel …` and `ingest …`, so operators run every command with the same image, settings and volumes: `docker compose run --rm server keys create`.
2. **Distroless, non-root, read-only.** The build runs on `node:24-trixie-slim` and the result on `gcr.io/distroless/nodejs24-debian13:nonroot` (same glibc, amd64 and arm64), as uid 65532. Only `/var/lib/scholarly` (runtime database) and `/data` (index) are written; compose mounts volumes there, sets `read_only: true` and a tmpfs `/tmp`.
3. **Model baked in.** The build downloads the model into `/models`, and the image sets `EMBEDDER_ALLOW_REMOTE=false`: the container starts without network access to Hugging Face and always uses the model the index was built with.
4. **Size.** A prune step keeps only Linux binaries of the target architecture for ONNX Runtime and sharp, and drops the WebAssembly builds of `onnxruntime-web` (transformers.js's browser backend; Node uses `onnxruntime-node`). From 1.26 GB to 744 MB unpacked, about 196 MB compressed: base 124 MB, app 245 MB, model 135 MB.
5. **Index by build context.** The image holds whatever directory `--build-context index=<dir>` names, normally one `index.sqlite`; compose passes `INDEX_DIR`. Without it the image has no index. A named volume at `/data` is seeded from the image on first start, and `ingest full` can write there too.
6. **Metrics internal.** `METRICS_PORT` moves `/metrics` to its own listener on `METRICS_HOST`; the public port then answers 404 for it. The image listens on 8080 (MCP, landing API, probes) and 9464 (metrics), and compose publishes only 8080, on loopback.
7. **Compose profiles.** `sqlite`: the server on the SQLite volumes. `postgres`: Postgres, a one-shot `migrate` as the writer role, then `server-pg` as the server role, so the schema is always current before a server starts. `tools`: the `ingest` service for one-off commands on the SQLite index. Every server has `stop_grace_period: 20s`, above `SHUTDOWN_TIMEOUT_MS` (10 s) plus 5 s, and a readiness healthcheck run with the image's own Node, since distroless has no shell or curl.

## Consequences

- **Measured.** Read-only root filesystem confirmed (`EROFS` on a write to `/app`); uid 65532; ready 1.8 s after start on the eval index; about 560 MiB resident; SIGTERM as PID 1 drains and exits 0. `ingest verify` passes through the image after a baked index was chowned to the app user.
- **Rebuilds.** Code changes rebuild the app layer; the model layer is cached. pnpm's store is a BuildKit cache mount, so dependency downloads are shared between builds.
- **No shell.** Debugging needs `docker run --entrypoint /nodejs/bin/node …` or a debug variant of the base image.

## Implementation note (2026-11-03, SM-14)

So that `docker run ghcr.io/…/scholarly-mcp` works with no settings, the image now defaults to `AUTH_MODE=api-key`, `HTTP_ALLOWED_HOSTS=localhost,127.0.0.1` and `LANDING_API_PORT=8081` (on loopback until `LANDING_API_HOST` and the secret open it), and the entrypoint applies `presets/$SCHOLARLY_PRESET.env` (default `thieme`, the preset of the demo index the release image carries, [ADR 0039](0039-demo-index-from-a-cc-by-doi-list.md)) under any setting already made. Set `SCHOLARLY_PRESET=` to turn it off.
