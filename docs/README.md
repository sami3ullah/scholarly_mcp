# Documentation

[← Back to the main README](../README.md)

Everything beyond the quick start lives here. New guides are added as the features they describe are built.

## Start here

| Document                             | What's inside                                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| [Engineering plan](PLAN.md)          | The full design: goals, architecture, data model, tool contracts, edge cases, standards and delivery plan |
| [Phase 0 results](spike-results.md)  | Crossref and Europe PMC coverage, embedding model and vector store checks                                 |
| [Ticket board](../tickets/README.md) | Work broken into tickets SM-00 to SM-17, with status                                                      |

## Run it and build on it

| Document                        | What's inside                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| [Self-hosting](SELF-HOSTING.md) | Your own HTTPS deployment with Docker Compose: SQLite or Postgres, index, VM, AWS, Cloudflare   |
| [Connectors](CONNECTORS.md)     | Adding a deployed server to Claude and ChatGPT, URL only, no auth                               |
| [Operations](OPERATIONS.md)     | Deploying the image, keeping the index fresh, scaling, capacity, monitoring, backups, upgrades  |
| [Adapters](ADAPTERS.md)         | The ports, plugging in your own content API, access rules, store, embedding model or billing    |
| [The landing page](LANDING.md)  | Running the landing app, the landing API contract, rebuilding the page in your own stack, tests |
| [Security](SECURITY.md)         | Reporting vulnerabilities, threat model, controls, supply chain checks, known limits            |

## Design

| Document                                                      | What's inside                                                              |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [Architecture decisions (ADRs)](adr/README.md)                | Every decision that deviates from or confirms the plan, with its reasoning |
| [Architecture overview](PLAN.md#high-level-architecture)      | Components, ports and what each one is responsible for                     |
| [Search design](PLAN.md#data-model-and-search-design)         | Canonical records, chunking, query pipeline and RRF fusion                 |
| [Tool contracts](PLAN.md#mcp-tool-contracts)                  | The article card, the six tools and their error codes                      |
| [Edge cases](PLAN.md#edge-cases-and-failure-handling)         | How ingestion, search, the server and landing pages handle failure         |
| [Crossref source](../packages/source-crossref/README.md)      | Configuration, usage and fixtures of the Crossref adapter                  |
| [Europe PMC enricher](../packages/source-europepmc/README.md) | Subjects and matching-only open access full text, rules and fixtures       |
| [HTTP client](../packages/http/README.md)                     | The shared retrying client for the Crossref and Europe PMC APIs            |
| [ONNX embedder](../packages/embedder-onnx/README.md)          | Configuration and usage of the embedding model adapter                     |
| [SQLite store](../packages/store-sqlite/README.md)            | Index and runtime files, text matching, build and swap                     |
| [Postgres store](../packages/store-postgres/README.md)        | Schemas, schema-per-build swaps, lexical and vector search, migrations     |
| [Ingest CLI](../apps/ingest/README.md)                        | Commands and configuration of the ingestion CLI                            |
| [Search service](../packages/search/README.md)                | Query pipeline, fusion, teasers, cursors and search settings               |
| [Eval CLI](../apps/eval/README.md)                            | Search latency bench and golden-set relevance eval                         |
| [MCP server](../apps/server/README.md)                        | The six tools, their inputs and outputs, layout and configuration          |
| [Landing app](../apps/landing/README.md)                      | The Next.js reference landing page: layout, scripts and tests              |
| [Citations](../packages/cite/README.md)                       | Citation styles, how records map to CSL, the vendored AMA style            |
| [Card view](../packages/card-view/README.md)                  | The MCP Apps card list for `search_articles`: build, contents, tests       |
| [Docker image and compose](../docker/README.md)               | Building the image, its commands, compose profiles and guarantees          |

## Guides

| Guide                                                          | What's inside                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [Ingestion](guides/ingestion.md)                               | Building, refreshing and verifying the index                                                     |
| [How ingestion works](guides/how-ingestion-works.md)           | Every step from Crossref to a swapped-in index, how full text stays hidden, and how it was built |
| [Operating the server](guides/operating-the-server.md)         | Public endpoint, rate limits, usage metering and webhooks, health, metrics, traces, shutdown     |
| [Connecting clients](guides/connecting-clients.md)             | Running the MCP server and connecting Claude Desktop or MCP Inspector, over stdio or HTTP        |
| [Evaluating search](guides/evaluating-search.md)               | The golden set, its metrics, the eval index and the regression gate for ranking changes          |
| [The funnel and the card view](guides/funnel-and-card-view.md) | What the funnel counts, the report and the live view, the beacons, the MCP Apps card view        |
| [Running on Postgres](guides/postgres.md)                      | The compose profile, roles, migrating, copying an index in, running the server, search parity    |

Planned:

| Guide                                                               | Ships with |
| ------------------------------------------------------------------- | ---------- |
| `guides/development.md` - local setup, scripts, testing conventions | SM-02      |

## Project process

| Document                                           | What's inside                                   |
| -------------------------------------------------- | ----------------------------------------------- |
| [Session handoff](session-handoff.md)              | Running log used to resume work across sessions |
| [Outreach memo](outreach/memo.md)                  | One-page memo for decision-makers (draft)       |
| [Loom script](outreach/loom-script.md)             | Checklist and timings for the demo video        |
| [PR template](../.github/pull_request_template.md) | What every pull request must describe           |
