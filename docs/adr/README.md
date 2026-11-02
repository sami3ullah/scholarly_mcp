# Architecture decision records

[← Docs index](../README.md) · [Main README](../../README.md)

Each ADR records one decision: the context, what we chose and what follows from it. A change to any key design decision in the [plan](../PLAN.md#key-design-decisions) needs a new ADR here.

| #                                                       | Decision                                                         | Status   |
| ------------------------------------------------------- | ---------------------------------------------------------------- | -------- |
| [0001](0001-node-24-lts.md)                             | Node 24 LTS instead of Node 22                                   | accepted |
| [0002](0002-keep-multilingual-e5-small.md)              | Keep multilingual-e5-small after the Phase 0 spike               | accepted |
| [0003](0003-cc-by-nc-nd-full-text-for-matching-only.md) | Allow CC BY-NC-ND full text for matching only                    | accepted |
| [0004](0004-subjects-from-europe-pmc.md)                | Derive subjects from Europe PMC, with a journal-level fallback   | accepted |
| [0005](0005-crossref-public-pool.md)                    | Use the Crossref public pool (no mailto) for now                 | accepted |
| [0006](0006-typescript-strict.md)                       | TypeScript in strict mode                                        | accepted |
| [0007](0007-streamable-http-and-stdio.md)               | Streamable HTTP for remote use, stdio for local development      | accepted |
| [0008](0008-ingestion-is-the-only-writer.md)            | Ingestion is the only writer; the server reads only              | accepted |
| [0009](0009-sqlite-default-postgres-adapter.md)         | SQLite by default, Postgres adapter for production               | accepted |
| [0010](0010-multilingual-e5-small-in-process.md)        | multilingual-e5-small embeddings, in-process via ONNX            | accepted |
| [0011](0011-reciprocal-rank-fusion.md)                  | Reciprocal Rank Fusion with k = 60                               | accepted |
| [0012](0012-retrieve-chunks-return-articles.md)         | Retrieve chunks, return articles                                 | accepted |
| [0013](0013-zod-at-the-edges.md)                        | zod schemas as the single source of truth at the edges           | accepted |
| [0014](0014-config-from-environment.md)                 | Configuration from environment variables, validated at boot      | accepted |
| [0015](0015-generic-name-with-thieme-preset.md)         | Generic `scholarly-mcp` name with a Thieme preset                | accepted |
| [0016](0016-teaser-and-link-only.md)                    | Only a 280-character teaser and a link in chat                   | accepted |
| [0017](0017-random-landing-tokens.md)                   | Random 128-bit landing tokens with a 24-hour expiry              | accepted |
| [0018](0018-plain-text-links-and-mcp-apps-cards.md)     | Plain text with links everywhere, MCP Apps cards where supported | accepted |
| [0019](0019-logger-package-and-core-boundaries.md)      | Logger package, logging port and core's ambient types            | accepted |
| [0020](0020-crossref-source-ingestion-rules.md)         | Crossref source: paging, notices, retractions and failure rules  | accepted |
| [0021](0021-chunking-language-and-embedder-rules.md)    | Chunking, per-chunk language and embedder rules                  | accepted |
| [0022](0022-sqlite-index-files-and-builds.md)           | SQLite index files, text matching and builds                     | accepted |
| [0023](0023-search-service-rules.md)                    | Search service: query rules, fusion, teasers, cursors, budget    | accepted |
| [0024](0024-europe-pmc-enrichment.md)                   | Europe PMC enrichment: subjects and matching-only full text      | accepted |
| [0025](0025-mcp-server-and-tool-rules.md)               | MCP server: SDK, transports, errors, links, journals, citations  | accepted |
| [0026](0026-golden-set-eval-and-tuning.md)              | Golden set, eval and tuning results                              | accepted |
| [0027](0027-measure-a-larger-embedding-model.md)        | Measure a larger embedding model before switching                | proposed |
