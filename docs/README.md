# Documentation

[← Back to the main README](../README.md)

Everything beyond the quick start lives here. New guides are added as the features they describe are built.

## Start here

| Document                             | What's inside                                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| [Engineering plan](PLAN.md)          | The full design: goals, architecture, data model, tool contracts, edge cases, standards and delivery plan |
| [Phase 0 results](spike-results.md)  | Crossref and Europe PMC coverage, embedding model and vector store checks                                 |
| [Ticket board](../tickets/README.md) | Work broken into tickets SM-00 to SM-16, with status                                                      |

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
| [Ingest CLI](../apps/ingest/README.md)                        | Commands and configuration of the ingestion CLI                            |
| [Search service](../packages/search/README.md)                | Query pipeline, fusion, teasers, cursors and search settings               |
| [Eval CLI](../apps/eval/README.md)                            | Search latency bench and golden-set relevance eval                         |
| [MCP server](../apps/server/README.md)                        | The six tools, their inputs and outputs, layout and configuration          |
| [Citations](../packages/cite/README.md)                       | Citation styles, how records map to CSL, the vendored AMA style            |

## Guides

| Guide                                                  | What's inside                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| [Ingestion](guides/ingestion.md)                       | Building, refreshing and verifying the index                                                     |
| [How ingestion works](guides/how-ingestion-works.md)   | Every step from Crossref to a swapped-in index, how full text stays hidden, and how it was built |
| [Operating the server](guides/operating-the-server.md) | API keys, OAuth, rate limits, usage metering and webhooks, health, metrics, traces, shutdown     |
| [Connecting clients](guides/connecting-clients.md)     | Running the MCP server and connecting Claude Desktop or MCP Inspector, over stdio or HTTP        |
| [Evaluating search](guides/evaluating-search.md)       | The golden set, its metrics, the eval index and the regression gate for ranking changes          |

Planned:

| Guide                                                               | Ships with |
| ------------------------------------------------------------------- | ---------- |
| `guides/development.md` - local setup, scripts, testing conventions | SM-02      |
| `ADAPTERS.md` - plugging in your own content API or store           | SM-13      |
| `LANDING.md` - rebuilding the landing page in your own stack        | SM-11      |
| `OPERATIONS.md` - deploying, scaling, monitoring                    | SM-14      |
| `SECURITY.md` - auth, privacy, threat model                         | SM-14      |

## Project process

| Document                                           | What's inside                                   |
| -------------------------------------------------- | ----------------------------------------------- |
| [Session handoff](session-handoff.md)              | Running log used to resume work across sessions |
| [PR template](../.github/pull_request_template.md) | What every pull request must describe           |
