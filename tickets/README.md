# Tickets

Source of truth for scope: `docs/PLAN.md`. Each ticket is a sizeable, shippable chunk that ends green (lint, types, tests).
Status values: `todo`, `in-progress`, `done`, `blocked`. Update the table when a ticket changes state.

| ID    | Title                                                | Phase | Depends on   | Status                         |
| ----- | ---------------------------------------------------- | ----- | ------------ | ------------------------------ |
| SM-00 | Feasibility spike                                    | 0     | -            | done                           |
| SM-01 | Monorepo foundations and CI                          | 1     | -            | done                           |
| SM-02 | Core domain, ports, config, errors, testkit          | 1     | SM-01        | done                           |
| SM-03 | Crossref source and normalisation pipeline           | 2     | SM-02        | done                           |
| SM-04 | Chunker and ONNX embedder                            | 2     | SM-02        | done                           |
| SM-05 | SQLite store and ingest CLI                          | 2     | SM-03, SM-04 | done                           |
| SM-06 | Europe PMC full-text source                          | 2     | SM-05        | done                           |
| SM-07 | Search service                                       | 3     | SM-05        | done                           |
| SM-08 | Golden set, eval and tuning                          | 3     | SM-07        | done (exit unmet, ADR 0027)    |
| SM-09 | MCP server: six tools and transports                 | 4     | SM-07        | done                           |
| SM-10 | Auth, rate limits, telemetry, metering, entitlements | 4     | SM-09        | done                           |
| SM-11 | Landing sessions and Next.js landing page            | 4b    | SM-09        | done                           |
| SM-12 | MCP Apps cards and funnel dashboard                  | 4b    | SM-10, SM-11 | done                           |
| SM-13 | Postgres adapter                                     | 5     | SM-07        | todo                           |
| SM-14 | Hardening, image and docs                            | 6     | SM-12        | todo                           |
| SM-15 | Demo deployment, recording, outreach                 | 7-8   | SM-14        | todo (needs user decisions)    |
| SM-16 | Embedding model evaluation (bge-m3)                  | 3     | SM-08        | done (e5-small kept, ADR 0029) |

Definition of done for every ticket: see "Definition of done" in `docs/PLAN.md`.
