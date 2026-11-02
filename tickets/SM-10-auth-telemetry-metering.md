# SM-10 Auth, rate limits, telemetry, metering, entitlements (Phase 4)

## Tasks

- [ ] API keys hashed, identified by prefix; auth decisions cached for seconds only; UNAUTHORIZED
- [ ] OAuth 2.1 resource-server mode (audience check) behind config
- [ ] Per-key token bucket; RATE_LIMITED with `retryAfter`
- [ ] `Origin` validation, CORS closed, body/query length limits
- [ ] `/healthz`, `/readyz` (model + index loaded), `/metrics` (Prometheus), OpenTelemetry traces
- [ ] Metering outbox with idempotency key; JSON-lines + webhook exporter with backoff; failed requests non-billable; never blocks requests
- [ ] Build the outbox on the runtime database's `usage_events` table (created in SM-05, ADR 0022)
- [x] Mock `Entitlements` adapter (built in SM-09 for `check_access`, ADR 0025)
- [ ] Replace `LOCAL_CALLER` with the API key's identity; lift the loopback-only `HTTP_HOST` rule behind an `Origin` allowlist (ADR 0025)
- [ ] `/readyz` from `LiveIndex.isReady()` plus the loaded embedder
- [ ] SIGTERM drains in-flight requests and flushes the outbox

## Exit

Every server/ops and metering edge case has a test.
