# SM-10 Auth, rate limits, telemetry, metering, entitlements (Phase 4)

## Tasks

- [x] API keys hashed, identified by prefix; auth decisions cached for seconds only; UNAUTHORIZED
- [x] OAuth 2.1 resource-server mode (audience check) behind config
- [x] Per-key token bucket; RATE_LIMITED with `retryAfter`
- [x] `Origin` validation, CORS closed, body/query length limits
- [x] `/healthz`, `/readyz` (model + index loaded), `/metrics` (Prometheus), OpenTelemetry traces
- [x] Metering outbox with idempotency key; JSON-lines + webhook exporter with backoff; failed requests non-billable; never blocks requests
- [x] Build the outbox on the runtime database's `usage_events` table (created in SM-05, ADR 0022)
- [x] Mock `Entitlements` adapter (built in SM-09 for `check_access`, ADR 0025)
- [x] Replace `LOCAL_CALLER` with the API key's identity; lift the loopback-only `HTTP_HOST` rule behind an `Origin` allowlist (ADR 0025)
- [x] `/readyz` from `LiveIndex.isReady()` plus the loaded embedder
- [x] SIGTERM drains in-flight requests and flushes the outbox

## Exit

Every server/ops and metering edge case has a test.

Done 2026-11-03: ADR 0031, guide `docs/guides/operating-the-server.md`. Every case above has a test; live smoke test on the real index in ADR 0031 consequences.
