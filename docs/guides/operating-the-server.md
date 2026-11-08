# Operating the server

[← Back to the docs index](../README.md)

How to expose the MCP server over HTTP safely: the public endpoint, rate limits, usage metering, health, metrics, traces and shutdown. The design and its reasons are in [ADR 0031](../adr/0031-auth-limits-metering-and-telemetry.md) and, for the public endpoint, [ADR 0048](../adr/0048-public-server-without-auth.md). Connecting a client is in the [client guide](connecting-clients.md).

Every command below assumes `source ~/.nvm/nvm.sh && nvm use` and `pnpm build`.

## Public endpoint and rate limits

`/mcp` is public: no credential is read or checked, and an `Authorization` header is ignored ([ADR 0048](../adr/0048-public-server-without-auth.md)). The server only returns discovery data (metadata, a teaser of at most 280 characters and links); access to the article is decided on the publisher's site. Usage events, logs and landing sessions record no caller identity.

HTTP beyond loopback (`HTTP_HOST=0.0.0.0`) is refused at boot unless `HTTP_ALLOWED_HOSTS` lists the public hostnames, for example `mcp.example.org`. `HTTP_ALLOWED_ORIGINS` lists the hostnames whose browser pages may call `/mcp`; requests without an `Origin` header, as MCP clients send them, always pass. Both default to `localhost`, `127.0.0.1` and `[::1]`. No route sends CORS headers.

```bash
MCP_TRANSPORT=http EMBEDDER_CACHE_DIR=.cache/models \
  node --env-file=presets/thieme.env apps/server/dist/main.js
```

Each client address has a token bucket: `RATE_LIMIT_PER_MINUTE` tool calls a minute (default 60), in bursts of up to `RATE_LIMIT_BURST` (default 20). When it is empty, the tool answers `RATE_LIMITED` with `retryAfter` in seconds. IPv6 clients are grouped by their /64. The bucket key is an HMAC-SHA-256 of the address under a secret made at start and held only in memory, so no address is stored or logged. With `STORE=postgres` the buckets live in Postgres, shared by replicas; with SQLite (one process) they stay in memory ([ADR 0036](../adr/0036-shared-rate-limit-buckets.md)). Each replica has its own secret, so a client spread over replicas can get up to one bucket per replica. If the bucket store fails, calls are allowed and a warning is logged. Stdio has one local bucket.

Many readers behind one address (a hospital network, a NAT) share one bucket: raise the limits for such deployments. Clients spread over many addresses are not limited as a whole; a CDN or WAF in front is the place for that.

### Behind a proxy

The client address is the socket's peer, unless that peer is in `HTTP_TRUSTED_PROXIES` (comma-separated addresses or CIDR ranges). Then it is the right-most `X-Forwarded-For` hop that is not itself trusted; hops to its left could have been written by the client. Behind a proxy or load balancer without it, every client shares the proxy's bucket. The [self-hosting bundle](../SELF-HOSTING.md) sets `10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7`, as only Caddy reaches the server; behind a load balancer directly, set it to the load balancer's ranges.

### Landing API

The landing API (`/landing/v1/page`, `/landing/v1/visits`, `/landing/v1/actions`, [landing guide](../LANDING.md)) has its own bucket per landing visitor: `LANDING_RATE_LIMIT_PER_MINUTE` (default 120) in bursts of `LANDING_RATE_LIMIT_BURST` (default 30). It takes `LANDING_API_SECRET` as a bearer token, and the server refuses to start with HTTP beyond loopback without it. Give the landing app the same secret, and keep the API on the internal network: only the landing app's server calls it. `LANDING_API_PORT` moves it to its own listener on `LANDING_API_HOST`, so the public port answers 404 for it.

Secrets can come from mounted files instead of the environment: `LANDING_API_SECRET_FILE`, `METER_WEBHOOK_SECRET_FILE` and `DATABASE_URL_FILE` name a file whose contents (one trailing newline dropped) become the variable. Set one form, not both ([ADR 0038](../adr/0038-landing-image-proxy-and-secret-files.md)).

## Usage metering

Every tool call writes one event to the outbox (`usage_events` in the runtime database): id, tool, result count, latency, status, cards shown per journal and whether it is billable. Only successful calls are billable. Landing visits and access button clicks are events too (`kind` `landing_visit` and `landing_action`, never billable), so the funnel survives session cleanup ([The funnel and the card view](funnel-and-card-view.md)). Events never hold query text or a landing token, and writing them never fails or slows a call.

Every exported event carries `kind`. A billing consumer that sums `billable` events needs no change; one that assumed every line is a tool call should filter on `kind: "tool_call"`.

The exporter sends pending events every `METER_EXPORT_MS` (5 s):

- **JSON lines**, always, to `METER_JSONL_PATH` (default `data/usage.jsonl`; `/var/lib/scholarly/usage.jsonl` in the image, on the state volume), one event per line.
- **Webhook**, when `METER_WEBHOOK_URL` is set: `POST` with `{ "events": [...] }`.

A batch counts as exported only when every sink took it. When one fails, the whole batch is sent again later with growing pauses (up to `METER_BACKOFF_MAX_MS`, 5 min), so delivery is at least once: **dedupe on the event `id`**. Exported events are deleted after `METER_RETENTION_DAYS` (30). `meter_outbox_pending` shows the backlog.

`scholarly-mcp funnel --from data/usage.jsonl --out funnel.html` turns the JSON lines file into the funnel report; `funnel --store --serve` shows the recent weeks live from the outbox ([The funnel and the card view](funnel-and-card-view.md#the-live-view)).

### Verifying webhook requests

With `METER_WEBHOOK_SECRET` set (at least 32 characters), each request carries:

| Header                  | Value                                                         |
| ----------------------- | ------------------------------------------------------------- |
| `x-scholarly-timestamp` | Unix seconds when the request was signed                      |
| `x-scholarly-signature` | `sha256=` and the hex HMAC-SHA256 of `<timestamp>.<raw body>` |
| `Idempotency-Key`       | A hash of the batch's event ids                               |

Check the signature over the raw body with a constant-time comparison, and refuse timestamps older than a few minutes. Answer any 2xx to accept the batch.

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(rawBody, timestamp, signature, secret) {
  const expected = `sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
  const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) < 300;
  return (
    fresh &&
    expected.length === signature.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  );
}
```

## Health, metrics and traces

| Route      | Answers                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `/healthz` | `200 {"status":"ok"}` while the process runs: the liveness probe                                                 |
| `/readyz`  | `200` when the index is open, the model loaded and the server not draining, `503` otherwise                      |
| `/metrics` | Prometheus text: tool calls, durations, HTTP requests, metering, landing pages, visits and actions, Node runtime |

These routes skip the `Host` and `Origin` checks so probes can reach the pod by address. They hold no article data, but keep `/metrics` internal: `METRICS_PORT` moves it to its own listener on `METRICS_HOST` (default `127.0.0.1`; the image uses port 9464), and the public port then answers 404 for it. No metric label carries a client address or query text.

Traces are off until `OTEL_EXPORTER_OTLP_ENDPOINT` is set, e.g. `http://localhost:4318`. Each HTTP request is a span, with a child span per tool call carrying the tool name, status and result count. `OTEL_SERVICE_NAME` defaults to `scholarly-mcp`; the other standard `OTEL_EXPORTER_OTLP_*` variables, such as headers, work as usual.

## Shutdown

On SIGTERM or SIGINT the server turns `/readyz` to `503`, stops accepting connections, lets requests in flight finish for up to `SHUTDOWN_TIMEOUT_MS` (10 s) and cuts the rest. It then flushes the outbox (one export, 5 s budget) and closes its files. Whatever could not be exported stays in the outbox and goes out after the next start. Set the orchestrator's grace period above `SHUTDOWN_TIMEOUT_MS` plus 5 s.

## Check it end to end

```bash
MCP_TRANSPORT=http METER_EXPORT_MS=1000 EMBEDDER_CACHE_DIR=.cache/models \
  node --env-file=presets/thieme.env apps/server/dist/main.js &
curl -s localhost:8080/readyz                                   # {"status":"ready",...}
(cd apps/server && node --input-type=module -e "
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
const client = new Client({ name: 'check', version: '0' });
await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8080/mcp')));
const result = await client.callTool({ name: 'search_articles', arguments: { query: 'Sepsis Intensivstation', limit: 2 } });
console.log(result.content[0].text.split('\\n')[0]);                 // 2 articles found.
await client.close();")
tail -n 1 data/usage.jsonl                                      # the call, billable, no query
curl -s localhost:8080/metrics | grep mcp_tool_calls_total
kill -TERM %1                                                   # drains, flushes, exits 0
```
