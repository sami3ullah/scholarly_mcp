# 0045 Self-hosting bundle

- Status: accepted, amended by [ADR 0048](0048-public-server-without-auth.md) (no API keys or OAuth in the bundle)
- Date: 2026-11-07
- Builds on ADR 0034 (Postgres), ADR 0037 (image, compose), ADR 0038 (landing image, proxy), ADR 0039 (demo index)

## Context

The owner decided against a hosted demo: the publisher gets a guide to host the service itself, with Docker Compose, deployable on AWS, Cloudflare or a plain VM, and easy to adopt with an existing Postgres. The root `compose.yaml` is for development: it builds images from source, binds to loopback, has local-only default passwords and no TLS, and serves the MCP endpoint and the landing page on two ports. A publisher needs one public hostname with TLS, published images, real secrets, and a choice of store without editing YAML.

## Decision

1. **A separate bundle in `deploy/`.** `deploy/compose.yaml`, `deploy/Caddyfile` and `deploy/.env.example`. The root compose file stays the development stack; the bundle only pulls published images and pins them with `SCHOLARLY_VERSION`. All settings go in `deploy/.env`; nobody edits the YAML to deploy.
2. **One hostname, Caddy in front.** Caddy (`caddy:2.10.2-alpine`) ends TLS for `PUBLIC_HOST` with a certificate it gets and renews from Let's Encrypt itself. `/mcp` and the OAuth protected-resource metadata go to the server, everything else to the landing app, so card links (`https://PUBLIC_HOST/mcp/landing?…`) and the MCP endpoint share one name and one certificate. The server's metrics (9464) and landing API (8081) stay on internal networks, as in ADR 0038. Caddy runs as root inside its container with every capability dropped and a read-only root, and listens on 8080 and 8443, published as 80 and 443, so it owns its certificate volume and needs no privileged port. It writes no access log, as landing links carry a session token.
3. **Store from settings.** `STORE=sqlite` (default) keeps the index and runtime database on volumes. `STORE=postgres` uses `DATABASE_URL` (server role) and `ADMIN_DATABASE_URL` (writer role): the bundled `pgvector/pgvector` service with `COMPOSE_PROFILES=postgres`, which reuses `docker/postgres/init`, or any existing Postgres with pgvector 0.8+ and pg_trgm, on which a superuser creates the roles once. A one-shot `init` service runs `ingest migrate` before the server on every `up`, so upgrades migrate themselves; it waits for the bundled database only when that profile is on (`required: false`).
4. **One `admin` service for writer commands.** `docker compose run --rm admin keys create …`, `… ingest incremental`, `… funnel`. It holds the writer's connection on Postgres and the same volumes on SQLite, so key and index commands look the same on both stores. Index refresh is a host cron job or systemd timer calling it; the image is distroless and carries no scheduler.
5. **Edges other than a public VM.** Behind Cloudflare Tunnel the `cloudflare` profile adds `cloudflared` (token from `.env`), Caddy serves plain HTTP inside (`SITE_ADDRESS=:8080`), binds the host ports to loopback and trusts the tunnel's private-range address for `Cf-Connecting-Ip`/`X-Forwarded-For`. Behind a load balancer that ends TLS (AWS ALB) the same three settings apply with its subnet ranges. Without trusted proxies Caddy overwrites `X-Forwarded-For`, which keeps the landing app's per-reader limit honest (ADR 0038).
6. **Index.** The published image carries the CC BY demo index (ADR 0039), so a fresh install answers at once. The publisher then builds the full index with `admin ingest full` (hours; their own content, their own host) or, on Postgres, copies a SQLite index in with `ingest copy`.
7. **Hardening by default.** Every service: read-only root, `no-new-privileges`, all capabilities dropped, `restart: unless-stopped`. The landing secret is a compose secret file the guide generates (`openssl rand`), owned by uid 65532.

## Consequences

- The guide (`docs/SELF-HOSTING.md`) is one path for every host: install Docker, clone, fill `.env`, generate the secret, `up`. AWS, Cloudflare and VM differences are a few `.env` lines and where DNS points.
- The bundle runs one server replica. Several replicas on Postgres need a platform that load-balances containers (ECS, Kubernetes); the guide points to the image settings in OPERATIONS.md for that.
- Card links need the landing app at `PUBLIC_HOST`. A publisher with its own landing page sets `LANDING_BASE_URL` elsewhere and calls the landing API from its stack (LANDING.md); the bundle's landing service can then be left out.
- `SCHOLARLY_VERSION` defaults to the release that carries ADRs 0042 to 0044 (`0.2.0`); a release must exist before the bundle pulls it.
- Clients that only speak OAuth (ChatGPT, claude.ai without header support) need `AUTH_MODE=oauth` against the publisher's identity provider (`docs/CONNECTORS.md`); one deployment runs one auth mode. (2026-11-08: `api-key+oauth` accepts both, [ADR 0047](0047-api-keys-and-oauth-in-one-deployment.md).)
