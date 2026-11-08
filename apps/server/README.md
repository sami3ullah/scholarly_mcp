# @scholarly-mcp/server

The MCP server: six read-only tools that return article cards, never article content, over stdio or Streamable HTTP ([ADR 0025](../../docs/adr/0025-mcp-server-and-tool-rules.md)). How to connect clients: [guide](../../docs/guides/connecting-clients.md).

| Tool              | Input                                                                                                                     | Output                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `search_articles` | `query`, `language` (de, en, any), `journal`, `yearFrom`, `yearTo`, `openAccessOnly`, `limit` (1-10, default 5), `cursor` | cards, `collectionUrl`, `nextCursor`, `indexVersion`, `hint` when empty                                     |
| `get_article`     | `doi`                                                                                                                     | card, subject labels, journal with link, `retracted`, `fullTextIndexed`                                     |
| `find_related`    | `doi`, `limit`                                                                                                            | the article, cards, `collectionUrl`                                                                         |
| `get_journal`     | `issn` or `query`                                                                                                         | up to 5 journals: ISSNs, counts, years, open access policy, subjects, link                                  |
| `cite`            | `doi`, `style` (vancouver, apa, ama, bibtex, ris)                                                                         | citation and the publisher link                                                                             |
| `check_access`    | `doi`                                                                                                                     | `open` or `subscription`, with login and purchase links (`institution` is reserved for a publisher adapter) |

Every response has a `notice` and a plain-text rendering for clients without structured content.

## Layout

| Folder                     | What it holds                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `tools/`                   | One file per tool, the shared schemas, text rendering and the single error mapping                                      |
| `server/`                  | The `McpServer` factory: registration, argument parsing, per-call logs                                                  |
| `http/`                    | Routes: the public `/mcp` behind `Host` and `Origin` checks, health, metrics; the client address behind trusted proxies |
| `transports/`              | The Node HTTP server: limits, in-flight tracking and draining                                                           |
| `limits/`                  | Per-client token bucket, keyed by an HMAC of the client address (ADR 0048)                                              |
| `metering/`                | Outbox meter, exporter with backoff, JSON-lines and webhook sinks                                                       |
| `telemetry/`               | Prometheus metrics and OpenTelemetry tracing                                                                            |
| `funnel/`                  | The `funnel` command: the report from the export or the store, the live view (ADR 0033/35)                              |
| `journals/`                | Journal catalog cached per index version, name and ISSN matching                                                        |
| `landing/`                 | Landing sessions and links, the landing API, its pages and referrals (ADR 0032/33)                                      |
| `access/`                  | Card access badge and licence, mock entitlements                                                                        |
| `runtime/`                 | The live index (reopens swapped builds, survives a missing one), random tokens                                          |
| `create-app.ts`, `main.ts` | Wiring, and the composition root that creates the real adapters                                                         |

## Configuration

`MCP_TRANSPORT`, `HTTP_HOST`, `HTTP_PORT`, `HTTP_ALLOWED_HOSTS`, `HTTP_ALLOWED_ORIGINS`, `HTTP_TRUSTED_PROXIES`, `SHUTDOWN_TIMEOUT_MS`, `PUBLISHER_NAME`, `JOURNAL_URL_TEMPLATE`, `INDEX_REFRESH_MS` (30 s), `SESSION_CLEANUP_MS` (1 h), `HTTP_ALONGSIDE_STDIO`, the landing API's `LANDING_API_SECRET` and `LANDING_RATE_LIMIT_*` ([landing guide](../../docs/LANDING.md)), `STORE` (`sqlite` by default, or `postgres` with `DATABASE_URL` as the server's role, [Postgres guide](../../docs/guides/postgres.md)), plus everything from the [embedder](../../packages/embedder-onnx/README.md), the [SQLite store](../../packages/store-sqlite/README.md) or the [Postgres store](../../packages/store-postgres/README.md), the [search service](../../packages/search/README.md), `LANDING_BASE_URL` and `LOG_LEVEL`. The public endpoint and its rate limits (`RATE_LIMIT_*`), metering (`METER_*`) and tracing (`OTEL_*`) are in the [operating guide](../../docs/guides/operating-the-server.md) ([ADR 0031](../../docs/adr/0031-auth-limits-metering-and-telemetry.md), [ADR 0048](../../docs/adr/0048-public-server-without-auth.md)). See the [client guide](../../docs/guides/connecting-clients.md#configuration) for defaults.

## Tests

Protocol tests run the real wiring on in-memory adapters with the official SDK client, over the HTTP handler and over stdio, list the tools and call each. Other tests cover every error code, the full-text guardrail on every tool, response size, journal matching the HTTP routes and guards, client address resolution behind trusted proxies, the token bucket (with a property test), metering through every outcome, exporter backoff and at-least-once delivery, webhook signatures, tracing without query text, and draining on a real port.
