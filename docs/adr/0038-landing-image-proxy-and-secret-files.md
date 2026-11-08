# 0038 Landing image, proxy and secret files

- Status: accepted
- Date: 2026-11-03
- Builds on ADR 0032 (landing API and app), ADR 0036 (shared buckets), ADR 0037 (server image, compose)

## Context

ADR 0032 left `output: 'standalone'` for the image, because `next start` refuses it. The plan asks for a landing image with `LANDING_API_SECRET` from a secret store, a proxy that sets `x-forwarded-for`, and the landing API reachable only from the app. The app keys its per-visitor limit on the first `x-forwarded-for` hop, so whoever sets that header picks the bucket. The landing API shares the server's public port with `/mcp`, guarded by its secret and the Host allowlist.

## Decision

1. **Standalone behind a flag.** `LANDING_STANDALONE=true` sets `output: 'standalone'`, with file tracing from the repository root so workspace packages are found. Without it the build is unchanged and `next start`, the Playwright suite and Lighthouse CI keep working. Turbo declares the variable, so a standalone build never reuses a cached normal one.
2. **The landing image.** `docker/landing/Dockerfile` builds the standalone server on `node:24-trixie-slim` and runs it on `gcr.io/distroless/nodejs24-debian13:nonroot` as uid 65532, like the server image. `docker/landing/Dockerfile.dockerignore` keeps `apps/landing`, which the root ignore file leaves out of the server's context. The root filesystem is read-only; compose mounts a tmpfs on `.next/cache`.
3. **Secrets from files.** Core `withSecretFiles(env, names, read)` resolves `<NAME>_FILE` for listed secrets only: the file's contents, without one trailing newline, become `<NAME>`. Setting both forms, or naming an unreadable file, fails at boot without echoing either. The server lists `LANDING_API_SECRET`, `METER_WEBHOOK_SECRET` and `DATABASE_URL`, the ingest `DATABASE_URL`, the landing app `LANDING_API_SECRET`. A list, not every `_FILE`, because `JOURNAL_SUBJECTS_FILE` already names a data file. Core stays pure: the apps pass the file reader.
4. **The landing API on its own port.** `LANDING_API_PORT` (with `LANDING_API_HOST`, default loopback) serves the landing API on a separate listener, as `METRICS_PORT` does for metrics, and the public port then answers 404 below `/landing/v1/`. The secret and the Host allowlist are required when that listener is beyond loopback, not when only the MCP port is. In stdio-alongside mode both HTTP listeners start or neither does.
5. **A proxy that owns `x-forwarded-for`.** The compose `landing` profile puts Caddy (`caddy:2.10.2-alpine`, uid 65532, read-only, admin API off) in front of the app. With no trusted proxies configured, Caddy discards a client's `X-Forwarded-For` and sets the client's own address, so a reader cannot choose a bucket by sending the header. Behind another load balancer, its ranges go under `trusted_proxies`.
6. **Networks.** Two internal compose networks: `landing-api` (server and app; the server is aliased `server` there and in `HTTP_ALLOWED_HOSTS`) and `landing-proxy` (app and proxy). Only the proxy publishes a port, on loopback. The app has no route out and is not reachable from the host directly. The landing secret is a compose secret read from `LANDING_API_SECRET_PATH`; a committed local-only value is the default.

## Consequences

- **Several replicas.** With `STORE=postgres` the server's landing bucket is already shared (ADR 0036), so landing app replicas need nothing more. The proxy then load-balances to them.
- **Measured.** Image 306 MB unpacked, about 77 MB compressed (standalone output 42 MB). In compose: the app answers a page through the proxy in about 80 ms on the eval index; 45 requests, each with a different forged `X-Forwarded-For`, shared one bucket and fell back to doi.org after the burst; the public port answers 404 below `/landing/v1/`, the landing port 401 without the secret; the app has no route out; read-only root (`EROFS`), uid 65532; about 120 MiB resident, the proxy about 14 MiB.
- **Stop.** Next's standalone server does not drain on SIGTERM and exits 143 at once. A page is one short API call, so at most requests in flight are cut; a later Next version or a wrapper could drain them.
- **TLS.** The compose proxy listens on plain HTTP on loopback. In production it ends TLS: replace `:8080` with the landing hostname in the Caddyfile, or put the app behind the platform's own proxy that overwrites `x-forwarded-for` in the same way.
- **Compose secret files.** Compose bind-mounts the file with its host permissions; it must be readable by uid 65532.
