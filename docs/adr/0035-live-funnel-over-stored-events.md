# 0035 Live funnel over the stored events

- Status: accepted
- Date: 2026-11-03
- Records: SM-13 (follow-up from SM-12); builds on ADR 0033 (funnel report), ADR 0034 (Postgres outbox), ADR 0031 (metering outbox)

## Context

ADR 0033 made the funnel a CLI over the JSON lines export and left a live view for when events sit in Postgres. With SM-13 they do: every replica appends to `scholarly.usage_events`, and the outbox keeps exported events for `METER_RETENTION_DAYS` (30 by default) before deleting them. A live view has to answer three questions: where it reads from, how it counts, and how it is served.

## Decision

1. **Read the outbox, count in TypeScript.** The `UsageOutbox` port gains `list({ from, to, apiKeyId, after, limit })`: stored events, exported or not, in `(occurredAt, id)` order with ids in byte order, a page at a time. Claims and leases are untouched. `readUsageEvents` in core pages through it with a keyset cursor, and `createFunnelCounter` (the counter behind `computeFunnel`) counts one event at a time. The counting rules stay in one place; a SQL version of them would be a second implementation to keep in step with `computeFunnel`.
2. **Both stores.** SQLite and Postgres implement `list`, the in-memory fake too, and the testkit outbox contract checks filters, paging and the byte-order tie break (base64url ids mix cases). Runtime migrations add an `(occurred_at, id)` index: SQLite 5, Postgres 3. Postgres compares `(occurred_at, id)` as a row, so the page query is one index range scan.
3. **The `funnel` command gets the store as a source.**
   - `funnel --store --out … [--json …]` writes the same report as `--from <usage.jsonl>`, from the store `STORE` picks.
   - `funnel --store --serve [--host 127.0.0.1] [--port 8092] [--refresh 60]` is the live view: `GET /` renders the report, `GET /funnel.json` gives the numbers, and `?since=&until=&key=` filter both. The page reloads itself with a `meta refresh`, so it stays script-free.
   - A count is reused for `--refresh` seconds per filter set (at most 32 kept), and requests meanwhile share one read, so reloads cannot pile up on the database. A failed read answers 503 and is not cached.
4. **Its own process, no login.** The view is not a route of the MCP server: the server's HTTP surface is public, and it has API keys for tools but no operator login. The view binds to loopback by default, warns when bound elsewhere, sends `no-store`, a CSP with `default-src 'none'` and `frame-ancestors 'none'`, and holds what the report holds: counts, journal names and key ids, never query text or tokens. On Postgres it needs only the server role, which may already read `usage_events`.
5. **What "live" covers.** The outbox keeps exported events only for `METER_RETENTION_DAYS`, so the live view covers the recent weeks. The report names its source and that window. The export file, or a warehouse fed by the webhook, stays the record for longer periods.

## Consequences

- **Memory.** A count holds one id per event to dedupe, as the file report does. At 30 days of retention that is fine for a prototype's traffic; a deployment with millions of events a month should count in its warehouse.
- **Schema.** Servers on Postgres refuse to start until `ingest migrate` has applied migration 3. SQLite servers migrate their runtime file at boot.
- **Duplicates.** The outbox keys events by id, so a live count has no duplicates to drop; the export may have some (at-least-once delivery), which the file report drops.
- **Operators reach it by tunnel.** On a remote host, `ssh -L 8092:127.0.0.1:8092` or a reverse proxy with its own login. Exposing it directly would publish per-client click-through.
- **Measured live.** Against the compose Postgres as `scholarly_server`: `ingest migrate` applied migration 3, the page query used `usage_events_by_time`, and 1,502 events appended through the Postgres outbox (two pages, many equal timestamps) were counted once each by `--store`. `--serve` answered the page and the JSON, refused a malformed day with 400 and stopped cleanly on SIGINT.
