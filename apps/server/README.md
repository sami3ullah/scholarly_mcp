# @scholarly-mcp/server

The MCP server: six read-only tools that return article cards, never article content, over stdio or Streamable HTTP ([ADR 0025](../../docs/adr/0025-mcp-server-and-tool-rules.md)). How to connect clients: [guide](../../docs/guides/connecting-clients.md).

| Tool              | Input                                                                                                                     | Output                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `search_articles` | `query`, `language` (de, en, any), `journal`, `yearFrom`, `yearTo`, `openAccessOnly`, `limit` (1-10, default 5), `cursor` | cards, `collectionUrl`, `nextCursor`, `indexVersion`, `hint` when empty    |
| `get_article`     | `doi`                                                                                                                     | card, subject labels, journal with link, `retracted`, `fullTextIndexed`    |
| `find_related`    | `doi`, `limit`                                                                                                            | the article, cards, `collectionUrl`                                        |
| `get_journal`     | `issn` or `query`                                                                                                         | up to 5 journals: ISSNs, counts, years, open access policy, subjects, link |
| `cite`            | `doi`, `style` (vancouver, apa, ama, bibtex, ris)                                                                         | citation and the publisher link                                            |
| `check_access`    | `doi`                                                                                                                     | `open`, `institution` or `subscription`, with login and purchase links     |

Every response has a `notice` and a plain-text rendering for clients without structured content.

## Layout

| Folder                     | What it holds                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `tools/`                   | One file per tool, the shared schemas, text rendering and the single error mapping |
| `server/`                  | The `McpServer` factory: registration, argument parsing, per-call logs             |
| `http/`                    | Routes: `/mcp` behind `Host`, `Origin` and auth checks, health, metrics, metadata  |
| `transports/`              | The Node HTTP server: limits, in-flight tracking and draining                      |
| `auth/`                    | API key and OAuth JWT verifiers, the caller carried in `AuthInfo`                  |
| `limits/`                  | Per-caller token bucket                                                            |
| `metering/`                | Outbox meter, exporter with backoff, JSON-lines and webhook sinks                  |
| `telemetry/`               | Prometheus metrics and OpenTelemetry tracing                                       |
| `keys/`                    | The `keys create`, `list` and `revoke` command                                     |
| `journals/`                | Journal catalog cached per index version, name and ISSN matching                   |
| `landing/`                 | Landing sessions and links                                                         |
| `access/`                  | Card access badge and licence, mock entitlements                                   |
| `runtime/`                 | The live index (reopens swapped builds, survives a missing one), random tokens     |
| `create-app.ts`, `main.ts` | Wiring, and the composition root that creates the real adapters                    |

## Configuration

`MCP_TRANSPORT`, `HTTP_HOST`, `HTTP_PORT`, `HTTP_ALLOWED_HOSTS`, `HTTP_ALLOWED_ORIGINS`, `SHUTDOWN_TIMEOUT_MS`, `PUBLISHER_NAME`, `JOURNAL_URL_TEMPLATE`, `INDEX_REFRESH_MS` (30 s), `SESSION_CLEANUP_MS` (1 h), plus everything from the [embedder](../../packages/embedder-onnx/README.md), the [SQLite store](../../packages/store-sqlite/README.md), the [search service](../../packages/search/README.md), `LANDING_BASE_URL` and `LOG_LEVEL`. Auth (`AUTH_MODE`, `AUTH_CACHE_MS`, `OAUTH_*`), rate limits (`RATE_LIMIT_*`), metering (`METER_*`) and tracing (`OTEL_*`) are in the [operating guide](../../docs/guides/operating-the-server.md) ([ADR 0031](../../docs/adr/0031-auth-limits-metering-and-telemetry.md)). See the [client guide](../../docs/guides/connecting-clients.md#configuration) for defaults.

## Tests

Protocol tests run the real wiring on in-memory adapters with the official SDK client, over the HTTP handler and over stdio, list the tools and call each. Other tests cover every error code, the full-text guardrail on every tool, response size, journal matching the HTTP routes, guards and auth modes, API key and JWT verification, the token bucket (with a property test), metering through every outcome, exporter backoff and at-least-once delivery, webhook signatures, tracing without query text, and draining on a real port.
