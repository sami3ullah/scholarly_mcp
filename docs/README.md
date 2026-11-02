# Documentation

[← Back to the main README](../README.md)

Everything beyond the quick start lives here. New guides are added as the features they describe are built.

## Start here

| Document                             | What's inside                                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| [Engineering plan](PLAN.md)          | The full design: goals, architecture, data model, tool contracts, edge cases, standards and delivery plan |
| [Phase 0 results](spike-results.md)  | Crossref and Europe PMC coverage, embedding model and vector store checks                                 |
| [Ticket board](../tickets/README.md) | Work broken into tickets SM-00 to SM-15, with status                                                      |

## Design

| Document                                                 | What's inside                                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------------- |
| [Architecture decisions (ADRs)](adr/README.md)           | Every decision that deviates from or confirms the plan, with its reasoning |
| [Architecture overview](PLAN.md#high-level-architecture) | Components, ports and what each one is responsible for                     |
| [Search design](PLAN.md#data-model-and-search-design)    | Canonical records, chunking, query pipeline and RRF fusion                 |
| [Tool contracts](PLAN.md#mcp-tool-contracts)             | The article card, the six tools and their error codes                      |
| [Edge cases](PLAN.md#edge-cases-and-failure-handling)    | How ingestion, search, the server and landing pages handle failure         |

## Guides

Written as each part ships. Planned:

| Guide                                                               | Ships with |
| ------------------------------------------------------------------- | ---------- |
| `guides/development.md` - local setup, scripts, testing conventions | SM-02      |
| `guides/ingestion.md` - building and refreshing the index           | SM-05      |
| `guides/connecting-clients.md` - Claude, ChatGPT and MCP Inspector  | SM-09      |
| `ADAPTERS.md` - plugging in your own content API or store           | SM-13      |
| `LANDING.md` - rebuilding the landing page in your own stack        | SM-11      |
| `OPERATIONS.md` - deploying, scaling, monitoring                    | SM-14      |
| `SECURITY.md` - auth, privacy, threat model                         | SM-14      |

## Project process

| Document                                           | What's inside                                   |
| -------------------------------------------------- | ----------------------------------------------- |
| [Session handoff](session-handoff.md)              | Running log used to resume work across sessions |
| [PR template](../.github/pull_request_template.md) | What every pull request must describe           |
