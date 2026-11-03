# Operating the server

[← Back to the docs index](../README.md)

How to expose the MCP server over HTTP safely: API keys or OAuth, rate limits, usage metering, health, metrics, traces and shutdown. The design and its reasons are in [ADR 0031](../adr/0031-auth-limits-metering-and-telemetry.md). Connecting a client is in the [client guide](connecting-clients.md).

Every command below assumes `source ~/.nvm/nvm.sh && nvm use` and `pnpm build`.

## Auth modes

| `AUTH_MODE` | Who may call `/mcp`                                                          | Use it for                                 |
| ----------- | ---------------------------------------------------------------------------- | ------------------------------------------ |
| `none`      | Anyone who reaches the port, as the caller `local`. Only allowed on loopback | Your own machine, MCP Inspector            |
| `api-key`   | Requests with `Authorization: Bearer smk_…` of an active key                 | The demo and pilots                        |
| `oauth`     | Requests with a JWT access token issued for this server by your IdP          | Production behind the publisher's identity |

Stdio never authenticates: the client starts the server as its own process.

HTTP beyond loopback (`HTTP_HOST=0.0.0.0`) is refused at boot unless `AUTH_MODE` is `api-key` or `oauth` and `HTTP_ALLOWED_HOSTS` lists the public hostnames, for example `mcp.example.org`. `HTTP_ALLOWED_ORIGINS` lists the hostnames whose browser pages may call `/mcp`; requests without an `Origin` header, as MCP clients send them, always pass. Both default to `localhost`, `127.0.0.1` and `[::1]`. No route sends CORS headers.

## API keys

Keys live in the runtime database (`RUNTIME_DB_PATH`), stored as the SHA-256 of their secret. The full key is printed once, when it is made.

```bash
node apps/server/dist/main.js keys create --label "pilot clinic" --institution clinic-42
node apps/server/dist/main.js keys list
node apps/server/dist/main.js keys revoke key_abcdefgh2345
```

`--institution` is optional; it is passed to entitlements, so `check_access` answers `institution` for that key's callers. A revoked key stops working within `AUTH_CACHE_MS` (5 s). Usage events, logs and landing sessions name the caller by key id, never by key.

Start the server with keys required:

```bash
MCP_TRANSPORT=http AUTH_MODE=api-key EMBEDDER_CACHE_DIR=.cache/models \
  node --env-file=presets/thieme.env apps/server/dist/main.js
```

A client sends the key as a bearer token. Without one, or with a wrong or revoked one, `/mcp` answers `401` with a `WWW-Authenticate: Bearer` challenge.

## OAuth

Set `AUTH_MODE=oauth` and:

| Variable                  | Meaning                                                                    |
| ------------------------- | -------------------------------------------------------------------------- |
| `OAUTH_ISSUER`            | The identity provider's issuer URL; tokens must carry it as `iss`          |
| `OAUTH_AUDIENCE`          | This server's public `/mcp` URL; tokens must carry it in `aud`             |
| `OAUTH_JWKS_URL`          | The provider's JSON Web Key Set                                            |
| `OAUTH_REQUIRED_SCOPES`   | Optional comma-separated scopes every token needs (`403` otherwise)        |
| `OAUTH_INSTITUTION_CLAIM` | Optional claim holding the reader's institution, passed on to entitlements |

The server publishes Protected Resource Metadata at `/.well-known/oauth-protected-resource/mcp`, naming the issuer, and points to it in every `401`, so MCP clients can find where to log in. Only asymmetric signatures are accepted. The caller is `oauth:<client id>`.

## Rate limits

Each caller (key id or OAuth client) has a token bucket: `RATE_LIMIT_PER_MINUTE` tool calls a minute (default 60), in bursts of up to `RATE_LIMIT_BURST` (default 20). When it is empty, the tool answers `RATE_LIMITED` with `retryAfter` in seconds. The bucket is per process; with several replicas each allows the full rate.

## Usage metering

Every tool call writes one event to the outbox (`usage_events` in the runtime database): id, key id, tool, result count, latency, status and whether it is billable. Only successful calls are billable. Events never hold query text, and writing them never fails or slows a call.

The exporter sends pending events every `METER_EXPORT_MS` (5 s):

- **JSON lines**, always, to `METER_JSONL_PATH` (default `data/usage.jsonl`), one event per line.
- **Webhook**, when `METER_WEBHOOK_URL` is set: `POST` with `{ "events": [...] }`.

A batch counts as exported only when every sink took it. When one fails, the whole batch is sent again later with growing pauses (up to `METER_BACKOFF_MAX_MS`, 5 min), so delivery is at least once: **dedupe on the event `id`**. Exported events are deleted after `METER_RETENTION_DAYS` (30). `meter_outbox_pending` shows the backlog.

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

| Route      | Answers                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------- |
| `/healthz` | `200 {"status":"ok"}` while the process runs: the liveness probe                             |
| `/readyz`  | `200` when the index is open, the model loaded and the server not draining, `503` otherwise  |
| `/metrics` | Prometheus text: tool calls, durations, HTTP requests, auth failures, metering, Node runtime |

These routes skip the `Host`, `Origin` and auth checks so probes can reach the pod by address. They hold no article data, but keep `/metrics` internal at the load balancer. No metric label carries a key id or query text.

Traces are off until `OTEL_EXPORTER_OTLP_ENDPOINT` is set, e.g. `http://localhost:4318`. Each HTTP request is a span, with a child span per tool call carrying the tool name, status and result count. `OTEL_SERVICE_NAME` defaults to `scholarly-mcp`; the other standard `OTEL_EXPORTER_OTLP_*` variables, such as headers, work as usual.

## Shutdown

On SIGTERM or SIGINT the server turns `/readyz` to `503`, stops accepting connections, lets requests in flight finish for up to `SHUTDOWN_TIMEOUT_MS` (10 s) and cuts the rest. It then flushes the outbox (one export, 5 s budget) and closes its files. Whatever could not be exported stays in the outbox and goes out after the next start. Set the orchestrator's grace period above `SHUTDOWN_TIMEOUT_MS` plus 5 s.

## Check it end to end

```bash
node apps/server/dist/main.js keys create --label smoke        # copy the printed smk_… key
MCP_TRANSPORT=http AUTH_MODE=api-key METER_EXPORT_MS=1000 EMBEDDER_CACHE_DIR=.cache/models \
  node --env-file=presets/thieme.env apps/server/dist/main.js &
curl -s localhost:8080/readyz                                   # {"status":"ready",...}
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8080/mcp -d '{}'   # 401
(cd apps/server && MCP_KEY=smk_… node --input-type=module -e "
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
const client = new Client({ name: 'check', version: '0' });
await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8080/mcp'),
  { requestInit: { headers: { authorization: 'Bearer ' + process.env.MCP_KEY } } }));
const result = await client.callTool({ name: 'search_articles', arguments: { query: 'Sepsis Intensivstation', limit: 2 } });
console.log(result.content[0].text.split('\\n')[0]);                 // 2 articles found.
await client.close();")
tail -n 1 data/usage.jsonl                                      # the call, billable, no query
curl -s localhost:8080/metrics | grep mcp_tool_calls_total
kill -TERM %1                                                   # drains, flushes, exits 0
```
