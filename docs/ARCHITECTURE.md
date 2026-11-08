# Architecture

How scholarly-mcp is built and why. The decisions behind each part are recorded in [`docs/adr/`](adr/README.md); this document describes the system as it is and links the ADR where a decision has history. A change to a key design decision needs a new ADR.

## Overview

scholarly-mcp is an MCP server that turns AI assistants into a discovery channel for a scholarly publisher. It answers with a short list of relevant journal articles, each a link to a landing page on the publisher's site, never the article itself. It ships with a Thieme preset; it is an independent prototype, not affiliated with Thieme. It runs as one container with a SQLite index for zero-setup trials, and has a Postgres store for replicated production use.

**Problem.** Clinicians and researchers increasingly ask AI assistants instead of visiting publisher sites. Large publishers already make their content reachable from these assistants; a German-language medical publisher such as Thieme has no equivalent.

**Goals**

- **Link-first results:** title, journal, year, a teaser of at most 280 characters and a publisher link per article. No full text or whole abstracts in the chat: the AI gets enough to pick and explain relevance, the reader gets the rest on the publisher's site.
- **Personalised landing:** every link carries a short-lived token, so the landing page can show the chosen article, where the search matched, access options and related reading.
- **Cross-language retrieval:** a German query finds English papers and the reverse.
- **Zero-infrastructure trial:** `docker run` with a prebuilt index, no database or credentials to set up.
- **Production path:** a Postgres store adapter, and source and entitlement ports a publisher can point at its own systems.
- **Measurable referrals:** UTM tags plus the landing token tie each visit to the tool call that produced it, without storing query text.

**Non-goals**

- Generating answers or clinical advice. The server returns article cards; the AI client writes the reply.
- Showing article content in the chat beyond the teaser.
- Scraping or any unofficial data access.
- Changing the publisher's site. The landing page is a reference implementation a publisher's web team can rebuild in its own stack.
- Training or fine-tuning models.

**Targets and where they stand**

| Area              | Target                                                                   | Status                                                                                                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retrieval quality | recall@10 at least 0.8 on the 60-query golden set, 0.7 on cross-language | Not met: 0.710 overall, 0.655 cross-language on the eval index (`packages/testkit/golden/baseline.json`); the gap is the embedding model's language gap ([ADR 0029](adr/0029-keep-e5-small-after-model-comparison.md), [ADR 0044](adr/0044-language-lanes-for-any-language-search.md)) |
| Latency           | p95 under 500 ms at 20 tool calls a second on a 2-vCPU server            | Met on SQLite (about 420 ms) and on Postgres with a 4-vCPU database ([OPERATIONS.md](OPERATIONS.md#capacity))                                                                                                                                                                          |
| Attribution       | every result carries DOI, publisher link and licence                     | Enforced by the card schema                                                                                                                                                                                                                                                            |
| Landing page      | LCP under 2.5 s, CLS under 0.1, accessibility score 1                    | Enforced by Lighthouse CI                                                                                                                                                                                                                                                              |
| Code quality      | strict TypeScript, at least 85% line coverage, layering rules, CI green  | Enforced in CI                                                                                                                                                                                                                                                                         |

Corpus: the full Thieme index holds 70,989 journal articles published since 2024 (176,536 chunks, built 2026-11-03). Most have no abstract in Crossref (about 63% when measured), so many cards are title-only; open access full text from Europe PMC improves matching for some of them.

## High-level architecture

Two paths share one index: an offline ingest builds it from content sources, and the online MCP server only reads it. The server returns article cards whose links carry a short-lived token, so the landing page can rebuild that call's results for the reader. Everything a publisher would swap (sources, store, entitlements, landing page) sits behind a port.

```
 Crossref ──┐                                            ┌── AI clients (Claude, ChatGPT,
 Europe PMC ┴─> ingest ──writes──> index <──reads── MCP server <─┘   Cursor, MCP Inspector)
                (CLI)           (SQLite file           │  ▲
                                 or Postgres)          │  │ landing API
                                                       ▼  │
                                  runtime store:    landing page (reference, Next.js)
                                  sessions, usage   <── reader clicks a card link
```

| Component        | Responsibility                                                                                               | Swappable via                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Source           | Pages through records and emits canonical `Article` objects (Crossref)                                       | `Source` port                                  |
| Enricher         | Adds subjects and a reference to open access full text used for matching only (Europe PMC)                   | `ArticleEnricher` port                         |
| Ingest           | Enrich, licence-gate, chunk, embed, upsert, checkpoint, verify, swap the index; see [Ingestion](#ingestion)  | CLI, run on a schedule                         |
| Index            | Articles, chunks, lexical and vector search structures, index metadata, sync state                           | `IndexStorage`, `IndexReader`, `ArticleSearch` |
| Embedder         | Turns passages and queries into unit-length vectors in-process (ONNX)                                        | `Embedder` port                                |
| Search service   | Lexical and vector retrieval in parallel, language lanes, RRF fusion, collapse to articles, teasers, cursors | Core logic (`packages/search`), not swapped    |
| Tool layer       | Six read-only MCP tools returning article cards with teasers and links                                       | Core logic (`apps/server`), not swapped        |
| Landing sessions | Stores each call's result list under a random token for 24 hours                                             | `SessionStore` port                            |
| Landing API      | `/landing/v1/` on the server: composes the landing page model, records visits and access clicks              | HTTP contract ([LANDING.md](LANDING.md))       |
| Landing page     | Next.js reference page that renders the landing API's page model                                             | A publisher rebuilds it in its own stack       |
| Entitlements     | Open, subscription or institution status, with login and purchase links                                      | `Entitlements` port (mock in the demo)         |
| Rate limits      | Token bucket per client address for tool calls, per visitor for the landing API                              | `RateBucketStore` port (memory or Postgres)    |
| Metering         | Tool calls and referral events into an outbox, exported to JSON lines and an optional webhook; funnel report | `Meter`, `UsageOutbox` ports                   |
| Telemetry        | Structured logs, `/metrics`, OpenTelemetry traces, `/healthz` and `/readyz`                                  | Config                                         |

The `/mcp` endpoint is public: no API key or OAuth token is read or required ([ADR 0048](adr/0048-public-server-without-auth.md)). Access to articles is decided on the publisher's site behind every link.

## Key design decisions

The design is ports and adapters: the core knows nothing about Crossref, SQLite or Postgres, so each can be swapped without touching search or the tools.

| #   | Decision         | Choice                                                                                                                    | Why                                                                                                         | Revisit when                                                  | ADR                                                                                                                                                                                                              |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Language         | TypeScript in strict mode on Node 24 LTS                                                                                  | Official MCP TypeScript SDK; one language from ingest to landing page                                       | A publisher mandates another runtime                          | [0001](adr/0001-node-24-lts.md), [0006](adr/0006-typescript-strict.md)                                                                                                                                           |
| 2   | Transport        | Streamable HTTP at `/mcp`, stateless, for remote use; stdio for local use                                                 | Organisation-wide connectors need HTTP; stdio makes desktop clients trivial to test                         | The MCP spec changes transports                               | [0007](adr/0007-streamable-http-and-stdio.md), [0025](adr/0025-mcp-server-and-tool-rules.md)                                                                                                                     |
| 3   | Read/write split | The ingest is the only writer of the index; the server opens it read-only                                                 | Stateless server scales horizontally; no write contention on the index                                      | Live per-user data is needed                                  | [0008](adr/0008-ingestion-is-the-only-writer.md)                                                                                                                                                                 |
| 4   | Index store      | SQLite (FTS5, plain vector table scanned with sqlite-vec) by default; Postgres (tsvector, pgvector HNSW) adapter          | Zero-setup trial and a replicated production path behind the same ports                                     | Corpus grows past about 1M chunks on SQLite                   | [0009](adr/0009-sqlite-default-postgres-adapter.md), [0022](adr/0022-sqlite-index-files-and-builds.md), [0034](adr/0034-postgres-store-adapter.md), [0040](adr/0040-sqlite-vector-scan-by-euclidean-distance.md) |
| 5   | Embeddings       | multilingual-e5-small (384 dimensions), in-process via ONNX (transformers.js); model selectable, version stored per chunk | German and English, no external API or keys, fast on CPU; larger models measured no better                  | A model closes the cross-language gap at acceptable cost      | [0010](adr/0010-multilingual-e5-small-in-process.md), [0028](adr/0028-selectable-embedding-model.md), [0029](adr/0029-keep-e5-small-after-model-comparison.md)                                                   |
| 6   | Rank fusion      | Weighted Reciprocal Rank Fusion, k = 60 (lexical weight 1.01, each vector list 1)                                         | BM25 and cosine scores are not comparable; RRF is deterministic and needs little tuning                     | The eval shows a different blend wins                         | [0011](adr/0011-reciprocal-rank-fusion.md), [0026](adr/0026-golden-set-eval-and-tuning.md)                                                                                                                       |
| 7   | Units            | Retrieve chunks, return articles                                                                                          | Precise matching, one result per paper with its best passage                                                | Never                                                         | [0012](adr/0012-retrieve-chunks-return-articles.md)                                                                                                                                                              |
| 8   | Validation       | zod schemas for config, source records, tool input and output, landing API                                                | One source of truth; MCP JSON Schema is generated from it                                                   | Never                                                         | [0013](adr/0013-zod-at-the-edges.md)                                                                                                                                                                             |
| 9   | Config           | Environment variables validated at boot; fail fast                                                                        | 12-factor, container-friendly, no hidden defaults                                                           | Never                                                         | [0014](adr/0014-config-from-environment.md)                                                                                                                                                                      |
| 10  | Naming           | Generic `scholarly-mcp` with a Thieme preset (`presets/thieme.env`)                                                       | Avoids using the publisher's trademark; works for any Crossref prefix                                       | A publisher adopts it                                         | [0015](adr/0015-generic-name-with-thieme-preset.md)                                                                                                                                                              |
| 11  | Content in chat  | A teaser of at most 280 characters plus a link; full text used only for matching, under a licence allowlist               | Keeps readers and content on the publisher's site, where it can personalise, convert and measure            | The publisher sets its own policy                             | [0016](adr/0016-teaser-and-link-only.md), [0003](adr/0003-cc-by-nc-nd-full-text-for-matching-only.md)                                                                                                            |
| 12  | Landing links    | Random 128-bit token per call, 24-hour expiry, no query text in the URL                                                   | The page can rebuild the results without exposing what a reader typed in logs, referrers or forwarded links | Personalisation tied to logged-in accounts is wanted          | [0017](adr/0017-random-landing-tokens.md)                                                                                                                                                                        |
| 13  | Result rendering | Plain text with links in every client; an MCP Apps card list where the client supports it                                 | Links survive in any client; a clear "Read on" button makes the click the next step                         | Client support for MCP Apps changes                           | [0018](adr/0018-plain-text-links-and-mcp-apps-cards.md), [0033](adr/0033-referral-events-funnel-and-card-view.md)                                                                                                |
| 14  | Access           | Public `/mcp` without credentials; rate limits per client address                                                         | The server hands out discovery data only; any client connects with the URL alone                            | A publisher needs attribution or institution-specific answers | [0048](adr/0048-public-server-without-auth.md)                                                                                                                                                                   |

## Data model and search design

One canonical `Article` record feeds both stores; search retrieves chunks lexically and semantically in parallel, fuses them with RRF and returns one result per article.

### Canonical records

| Entity         | Fields                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Article        | `doi` (key, lowercased, no `https://doi.org/`), title, subtitle, journal (name, print ISSN, electronic ISSN), authors (given, family, ORCID), published date with precision (day, month or year), volume, issue, pages, language, abstract (plain text), subjects, licences (URL, content version, start date), `isOpenAccess`, `isRetracted`, full-text reference (source, PMCID, licence, revision), landing URL, `contentHash`, `sourceUpdatedAt`, `ingestedAt` |
| Chunk          | id, `doi`, ordinal, section label, text, language, token count, origin (`abstract`, `fulltext` or `metadata`), source, licence URL (required for full text), embedding (unit length), `modelVersion`                                                                                                                                                                                                                                                               |
| SyncState      | source, cursor, window start and end, last run status and time, last successful full run                                                                                                                                                                                                                                                                                                                                                                           |
| IndexMeta      | index version, model version, article and chunk counts, built at                                                                                                                                                                                                                                                                                                                                                                                                   |
| LandingSession | token (random 128-bit), ordered result DOIs with matched chunk ids (at most 10), language, the tool that made it, created at, expires at (24 hours), visit count. No query text, no caller identity.                                                                                                                                                                                                                                                               |
| UsageEvent     | One of `tool_call` (tool, result count, latency, status, billable, cards per journal), `landing_visit` (DOI, journal, tool) or `landing_action` (the same plus the action). Every event has an id (the idempotency key), occurred at and exported at. No query text, token or caller identity.                                                                                                                                                                     |

`isOpenAccess` means a Creative Commons version-of-record licence is in force ([ADR 0020](adr/0020-crossref-source-ingestion-rules.md)).

### SQLite store

- **Two files** ([ADR 0022](adr/0022-sqlite-index-files-and-builds.md)). The index file (`INDEX_PATH`, default `data/index.sqlite`) holds `articles`, `chunks`, `chunks_fts`, `chunks_trigram`, `vec_chunks`, `index_meta` and `sync_state`; only the ingest writes it. The runtime file (`RUNTIME_DB_PATH`, default `data/runtime.sqlite`, WAL mode) holds `landing_sessions` and `usage_events`, which the server writes and which survive index swaps. The runtime file has append-only migrations.
- **Text matching.** Text is folded (lowercase, `ä ö ü ß` to `ae oe ue ss`, other diacritics removed) and Snowball-stemmed in TypeScript (`packages/lexical`), in the chunk's language or in both German and English when unknown, because FTS5 has no German stemmer. `chunks_fts` (contentless FTS5, `unicode61 remove_diacritics 2`) has `text_stemmed`, `text_folded` and `title_stemmed`, so title words find articles whose abstract does not repeat them. BM25 weights 1, 0.5, 2.
- **Compounds.** `chunks_trigram` (trigram tokenizer) holds folded title and text. When the main table returns fewer hits than the limit, query stems of four or more letters are matched as substrings and kept only at compound edges ("Vorhofflimmertherapie" from "Vorhofflimmern", not "fibrill" in "Defibrillation").
- **Vectors** ([ADR 0040](adr/0040-sqlite-vector-scan-by-euclidean-distance.md)). `vec_chunks` is a plain table, not a vec0 table: each chunk's vector plus its article's filter columns (language, year, ISSNs, open access, retracted), indexed by language. The scan is exact, ranks by sqlite-vec's `vec_distance_l2` (same order as cosine for unit vectors) on a memory-mapped read-only file, and joins `chunks` only for the top results, so every filter is exact and never cuts a top-k short.
- **Worker threads** ([ADR 0041](adr/0041-sqlite-search-on-worker-threads.md)). Lexical and vector searches run on `SQLITE_SEARCH_WORKERS` threads (default 2), each with its own read-only connection; article lookups stay on the main thread.
- **Builds.** Written to `<INDEX_PATH>.building`, verified, then renamed into place. The server reopens when `IndexMeta.version` changes. Changing stemming, folding or layout bumps `INDEX_SCHEMA_VERSION`, which forces a full rebuild.

### Postgres store

[ADR 0034](adr/0034-postgres-store-adapter.md); setup in [guides/postgres.md](guides/postgres.md).

- Each build is its own schema, `index_<build id>`. A control schema `scholarly` holds the runtime tables (sessions, usage outbox, rate-limit buckets), the migration log and a one-row `live_index` pointer flipped at commit.
- Lexical: `text_stemmed`, `text_folded` and `title_stemmed` from the same `packages/lexical` code as SQLite, in a generated `tsv` column with the `simple` config (title A, stemmed text B, folded text C) and a GIN index. Words are weighted by BM25 inverse document frequency from a per-build `term_stats` table. Compound top-up via `pg_trgm`.
- Vectors: `embedding vector(<dimensions>)` with an HNSW index on `vector_cosine_ops`, iterative scan so filters never cut a result list short.
- Roles: the ingest connects as a writer that owns the index schemas; the server role has `SELECT` on committed index schemas and read and write only on sessions, the outbox and rate-limit buckets. Runtime migrations are versioned and run by `ingest migrate`.

### Chunking

[ADR 0021](adr/0021-chunking-language-and-embedder-rules.md).

1. Split on structure first: abstract sections (labelled when an abstract has at least two distinct labels) and full-text sections are hard boundaries.
2. Inside a section, paragraphs and then sentences are packed into balanced chunks of at most 400 tokens, counted with the model's own tokenizer; a sentence over the limit is split between words.
3. Up to two trailing sentences (at most 100 tokens) repeat in the next chunk of the same section.
4. Language is detected per paragraph and stored per chunk; a change of language starts a new chunk, so bilingual abstracts give single-language chunks.
5. The article title is prepended to every chunk's embedding text, so short chunks keep their context. An article without an abstract gets one `metadata` chunk of title and subtitle.

### Query pipeline

[ADR 0023](adr/0023-search-service-rules.md), amended by [ADR 0044](adr/0044-language-lanes-for-any-language-search.md).

1. **Validate:** Unicode NFC, strip soft hyphens, zero-width and control characters, collapse whitespace, cap at 500 characters. A query without any letter or digit is `INVALID_INPUT`.
2. **DOI shortcut:** a DOI anywhere in the query, also as a doi.org link, goes straight to a lookup; only the retraction rule applies.
3. **Lexical terms:** letter-and-digit runs without stopwords and one-character words; a small, test-covered DE/EN abbreviation map adds expansions. Stopword-only queries are vector-only. Terms are stemmed in the detected language, or in both when detection is unsure.
4. **Embed** with the `query: ` prefix e5 models require (`passage: ` at index time), with abbreviation expansions appended. An LRU of 1,000 embeddings is keyed by the SHA-256 of the embedded text, so it holds no query text.
5. **Retrieve in parallel:** lexical top 50 and vector top 50 with the same filters. Without a language filter, the vector side runs in two lanes (German passages, all others), 50 each. Vector hits more than 0.055 below the best hit of all lanes are dropped.
6. **Fuse** with weighted RRF over chunks: score = sum of weight / (60 + rank).
7. **Collapse** to one result per DOI, keeping the best chunk. Order: exact title match first, then score, then newer publication date, then DOI. When the first five all come from one lane, the other lane's best related result moves to fifth place.
8. **Present:** build each teaser and `whyMatched` label (see [The article card](#the-article-card)).
9. **Page** with an opaque cursor encoding the next offset and the index version.

Every search runs under a 2 s budget (`SEARCH_BUDGET_MS`) that settles on time even if a port ignores its abort signal. The tool layer then attaches access status, stores a landing session and puts its token in every link.

## Ingestion

The ingest (`apps/ingest`) is the only writer of the index. Operator guide: [guides/ingestion.md](guides/ingestion.md); walkthrough: [guides/how-ingestion-works.md](guides/how-ingestion-works.md).

**Commands:** `ingest full | incremental | verify | migrate`, `ingest purge-license <url>`, `ingest copy --from <index>`, `ingest subset --from <index> --dois <file> --out <index>`, `ingest reembed --from <index> --out <index>`. `STORE` selects SQLite or Postgres. Exit codes: 0 done, 1 failed or not verified, 2 bad usage.

**Per run**

1. **Plan.** A scheduler only ever calls `ingest incremental`. It becomes a full run when there is no index, the index layout or embedding model differs, or the last full run is older than `INGEST_FULL_RUN_DAYS` (default 7).
2. **Build target.** A full run starts from an empty build; an incremental run from a copy of the live index. A leftover build of the same kind and layout is resumed from its checkpoint; any other is discarded.
3. **Fetch a page** from Crossref ([ADR 0020](adr/0020-crossref-source-ingestion-rules.md)): `/prefixes/{CROSSREF_PREFIX}/works`, `journal-article` only, from `CROSSREF_FROM_PUB_DATE`, in deposit order with cursor paging. Incremental runs ask for records updated since the last window's end minus one day. With `INGEST_DOIS_FILE` only the listed DOIs are fetched ([ADR 0039](adr/0039-demo-index-from-a-cc-by-doi-list.md)). Notices (errata, corrections, retraction notices) are skipped; retracted articles are marked; JATS abstracts are cleaned to plain text with section labels.
4. **Enrich** (when `EUROPEPMC_ENABLED`, on in the Thieme preset; [ADR 0024](adr/0024-europe-pmc-enrichment.md)): one batched Europe PMC lookup per page, matched on DOI only, adds MeSH and keyword subjects and a full-text reference when every licence check passes. Journal-level subjects from `JOURNAL_SUBJECTS_FILE` fill in for articles with none ([ADR 0004](adr/0004-subjects-from-europe-pmc.md)).
5. **Prepare each article:** skip it when the build holds the same `contentHash`; reuse the live index's chunks and vectors when hash and model match; otherwise fetch the full text (body only, generic section labels), chunk and embed. Full text that is missing or unusable is dropped and the article indexed from metadata.
6. **Write** the page's records and the checkpoint after them in one transaction, so a checkpoint can never be ahead of the data.
7. **Verify, then swap.** Integrity checks, a chunk for every article and a vector for every chunk, one model version equal to the embedder's, no shrink of more than 10% against the live index, and sample queries (articles found by their title words, chunks by their own vectors). A build that fails is discarded and the live index left alone. SQLite renames the file into place; Postgres flips the `live_index` pointer.
8. **Serve.** The server checks the index every `INDEX_REFRESH_MS` (default 30 s) and moves to a new version; a refused build leaves the current index open.

A repeated run writes 0 rows. SIGINT or SIGTERM stops a run and keeps its build for the next run to resume. `purge-license` removes every full-text chunk under a licence that left the allowlist, through the same verify-and-swap path.

## MCP tool contracts

Six read-only tools return article cards, never article content: enough for the AI to pick and explain the right papers, with the reading itself on the publisher's site. Schemas live in `apps/server/src/tools`.

### The article card

Every tool that returns articles uses `articleCardSchema` (`packages/core/src/card/article-card.ts`).

| Field                                     | Content                                                                                                                                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `doi`                                     | Canonical DOI, also the fallback link via doi.org                                                                                                                                                                                                 |
| `title`, `journal`, `year`, `firstAuthor` | From Crossref metadata                                                                                                                                                                                                                            |
| `teaser`                                  | At most 280 characters, cut at a word boundary: the first sentence of a conclusion section, else a sentence opening "In conclusion" or similar, else the first sentence; a short opening question is skipped. Empty when there is no abstract.    |
| `whyMatched`                              | At most 120 characters, built only from section labels and the query's own terms, never from article text: "Matched in Results: rivaroxaban", "Matched in title: …", "Related in meaning (Methods)"; full-text hits name only the generic section |
| `access`                                  | `open` for open access, `subscription` otherwise ([ADR 0043](adr/0043-card-access-from-the-open-access-flag.md)); the schema also allows `unknown`, which an entitlement adapter may answer                                                       |
| `license`                                 | The version-of-record licence URL in force, or `unknown`                                                                                                                                                                                          |
| `url`                                     | Landing link with token and UTM tags: `<LANDING_BASE_URL>/mcp/landing?t=<token>&doi=<doi>&utm_source=mcp&utm_medium=ai&utm_campaign=<tool>`                                                                                                       |

| Tool              | Input                                                                                                                                                                                                 | Output                                                                                                                                                     | Notes                                                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_articles` | `query` (1-500 chars, or a DOI), `language` (`de`, `en`, `any`; default `any`), `journal` (name or ISSN), `yearFrom`, `yearTo`, `openAccessOnly` (default false), `limit` (1-10, default 5), `cursor` | up to 10 cards, `collectionUrl` (one landing link for all results), `nextCursor`, `indexVersion`, `hint`                                                   | Empty results carry a hint to loosen filters. An unknown or ambiguous journal is `INVALID_INPUT` with up to five candidates. Has an MCP Apps card view. |
| `get_article`     | `doi`                                                                                                                                                                                                 | one card, up to ten subject labels, journal (name, ISSNs, link), `retracted` with a warning, `fullTextIndexed`                                             | No abstract beyond the teaser                                                                                                                           |
| `find_related`    | `doi`, `limit` (1-10, default 5)                                                                                                                                                                      | the starting article (DOI, title), cards, `collectionUrl`, `indexVersion`, `hint`                                                                          | Nearest neighbours of the article's normalised mean chunk vector; retracted articles excluded                                                           |
| `get_journal`     | exactly one of `issn` or `query`                                                                                                                                                                      | up to five journals: name, ISSNs, article count, years, open access policy (`open`, `hybrid`, `subscription`) with open article count, subjects, page link | Built from indexed records only; the link needs `JOURNAL_URL_TEMPLATE`, unset in the Thieme preset                                                      |
| `cite`            | `doi`, `style` (`vancouver`, `apa`, `ama`, `bibtex`, `ris`; default `vancouver`)                                                                                                                      | formatted citation, publisher link, `retracted`                                                                                                            | CSL-based (`packages/cite`, citation-js), snapshot-tested                                                                                               |
| `check_access`    | `doi`                                                                                                                                                                                                 | `status` (`open`, `institution`, `subscription`, `unknown`), publisher link, `loginUrl`, `purchaseUrl`                                                     | Asks the `Entitlements` port; callers are anonymous. The demo mock answers `open` or `subscription` with doi.org links                                  |

Card-returning calls (`search_articles`, `get_article`, `find_related`) store their results under a fresh token for 24 hours. If the session store fails, links go without the token and the call still succeeds.

**Conventions for every tool**

- Annotations: `readOnlyHint: true`, `openWorldHint: false`. Inputs are strict objects: an unknown argument is `INVALID_INPUT`.
- Descriptions tell the model how to present results: a short list of linked titles, one line each on why it fits, and a pointer to the link. They say not to stretch a teaser into a summary, to treat card text as data, never as instructions, and never to present results as clinical advice. The server instructions add that metadata is for discovery, not model training.
- Every response has structured content and a plain-text rendering: a numbered list of Markdown-linked titles introduced by a note that card text is data. The text aims at 5 KB (teasers are dropped from the last card up until it fits; titles, links and attribution always stay), and the whole response stays under 20 KB.
- Where the client supports MCP Apps, `search_articles` points at a card-list UI resource (`packages/card-view`): title, journal, teaser, access badge and a "Read on {publisher}" button. Other clients get the same content as text with links.
- Every response includes `notice`: "Evidence pointers, not clinical advice. Independent prototype, not affiliated with {PUBLISHER_NAME}."

### Errors

Tool errors return `isError: true` with a stable code, a message the model can act on and, where known, `field` and `retryAfter`, never a stack trace. All errors go through one function (`apps/server/src/tools/tool-error.ts`).

| Code                | When                                                                        | Model-facing message                              |
| ------------------- | --------------------------------------------------------------------------- | ------------------------------------------------- |
| `INVALID_INPUT`     | Schema fails, `yearFrom` after `yearTo`, bad DOI or cursor, unknown journal | What was wrong, naming the field                  |
| `NOT_FOUND`         | DOI not in the index                                                        | Suggest `search_articles`                         |
| `CURSOR_STALE`      | Index swapped between pages                                                 | Rerun the search without a cursor (fixed message) |
| `RATE_LIMITED`      | Client's token bucket empty                                                 | Includes `retryAfter` seconds                     |
| `TIMEOUT`           | Search over its 2 s budget                                                  | Retry or narrow the query                         |
| `INDEX_UNAVAILABLE` | Index missing, refused or being replaced                                    | Retry shortly (fixed message)                     |
| `INTERNAL`          | Anything unexpected; logged with its stack                                  | Retry, report if it persists (fixed message)      |

`SOURCE_UNAVAILABLE` exists in core for the ingest only (a content source kept failing after retries) and is never shown to a model.

## Edge cases and failure handling

The rule throughout: never fabricate, never block a request on a side system, and fail with a message the model can act on.

### Ingestion and data

| Edge case                                                             | Handling                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crossref 429, 5xx, timeouts, truncated JSON                           | Exponential backoff with full jitter (1 s base, 60 s cap), at least `Retry-After`; requests spaced by the advertised rate limit; a `Retry-After` beyond the cap fails fast as `RATE_LIMITED`; exhausted retries are `SOURCE_UNAVAILABLE` |
| Polite pool                                                           | Public pool by default; `CROSSREF_MAILTO` joins the polite pool ([ADR 0005](adr/0005-crossref-public-pool.md))                                                                                                                           |
| Deep paging                                                           | Cursor paging; an expired cursor restarts once from the watermark day, and idempotent upserts absorb the overlap                                                                                                                         |
| Records changed after the first load                                  | Incremental runs on update date with a one-day overlap; a failed run retries from its own window start                                                                                                                                   |
| DOI case and prefix variants                                          | Normalise to lowercase, strip `https://doi.org/` and `doi:` before any lookup or write                                                                                                                                                   |
| JATS abstracts (tags, MathML, entities, a leading "Abstract" heading) | Parsed with htmlparser2 into plain text with section labels; citation-only abstracts dropped; snapshot tests on real samples                                                                                                             |
| Bilingual abstracts, German title with English abstract               | Language detected per paragraph and stored per chunk                                                                                                                                                                                     |
| No abstract                                                           | One metadata chunk of title and subtitle; ranks normally; never invent text                                                                                                                                                              |
| Missing authors, year-only dates                                      | Optional fields with a stored date precision; citations degrade cleanly                                                                                                                                                                  |
| Non-article records and notices                                       | Filter to `journal-article`; errata, corrections and retraction notices skipped by relation or title                                                                                                                                     |
| Retractions                                                           | Read Crossref update relations; a retraction notice marks the original even when it was not re-deposited; retracted articles excluded from search by default                                                                             |
| Malformed record (no title, ISSN or year)                             | Skipped and counted, never fixed up                                                                                                                                                                                                      |
| Several licences or a future start date                               | Use the version-of-record licence in force; treat as closed until its start date; full runs pick up opened embargoes                                                                                                                     |
| Europe PMC has no match or a different version                        | Match on DOI only; full text only when every licence and flag check passes ([ADR 0024](adr/0024-europe-pmc-enrichment.md)); otherwise metadata only                                                                                      |
| Europe PMC down                                                       | Retries per request; five full-text failures in a row raise `SOURCE_UNAVAILABLE` and the run resumes from its checkpoint later                                                                                                           |
| Soft hyphens, zero-width characters, NFD umlauts                      | NFC normalisation and stripping before chunking and at query time                                                                                                                                                                        |
| Unchanged record re-fetched                                           | Same `contentHash`: skipped; a full rebuild reuses the live index's vectors                                                                                                                                                              |
| Crash halfway through a run                                           | Each page and its checkpoint are written in one transaction to a separate build; the next run resumes it; the build is swapped in only after verification                                                                                |
| Embedding model changed                                               | Full rebuild (or `ingest reembed` into a new file); the server refuses an index of another model version                                                                                                                                 |

### Search and queries

| Edge case                                                  | Handling                                                                                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Empty, punctuation-only or stopword-only query             | `INVALID_INPUT` for no letter or digit; vector-only search for stopword-only queries                        |
| FTS syntax in user input (quotes, `AND`, `NEAR`, `*`, `-`) | Raw input never reaches `MATCH` or `to_tsquery`: words are reduced to letters and digits and quoted         |
| SQL injection                                              | Parameterised queries only; a property test checks that no random string fails a store                      |
| Mixed-language query                                       | Semantic search carries it; the lexical side stems in both languages unless one is detected with confidence |
| Umlaut and ß variants ("Ärzte", "Aerzte")                  | Folding before stemming makes them share a stem                                                             |
| German compounds ("Vorhofflimmertherapie")                 | Trigram top-up at compound edges plus semantic search                                                       |
| Abbreviations ("VHF", "AF", "COPD")                        | Abbreviation map expands lexical terms and the embedded text                                                |
| Only one language on the first page                        | Language lanes and the mix rule bring the other language's best related result into the first five          |
| DOI or full title pasted as the query                      | DOI goes to direct lookup; an exact title match ranks first                                                 |
| No results                                                 | Empty list with a hint to loosen filters, not an error                                                      |
| `yearFrom` after `yearTo`, unknown journal                 | `INVALID_INPUT` naming the field                                                                            |
| Index swapped between page 1 and page 2                    | Cursor carries the index version; mismatch is `CURSOR_STALE`                                                |
| Identical scores                                           | Deterministic tie-break: newer first, then DOI                                                              |
| Oversized response                                         | At most 10 cards; text rendering trimmed towards 5 KB; under 20 KB in total                                 |

### Server, protocol and operations

| Edge case                             | Handling                                                                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unknown tool or malformed arguments   | `INVALID_INPUT` with what was wrong                                                                                                                      |
| Concurrent requests                   | Stateless handlers; SQLite index read-only and memory-mapped, searches on worker threads; Postgres connection pool                                       |
| DNS rebinding and cross-site requests | `Host` checked against `HTTP_ALLOWED_HOSTS`, a present `Origin` against `HTTP_ALLOWED_ORIGINS`; no CORS headers on any route                             |
| Cold start                            | Model loads (with a warm-up embedding) before the server listens; `/readyz` stays false until the index is open                                          |
| Index missing or corrupt              | The server starts anyway; tools answer `INDEX_UNAVAILABLE`, `/readyz` fails, each refresh tick retries, each distinct problem is logged once             |
| Slow query                            | 2 s budget per search via `AbortSignal`; `TIMEOUT`                                                                                                       |
| CPU starvation from embedding bursts  | One semaphore shared by queries and index batches (`EMBEDDER_CONCURRENCY`); waiting callers abort through their signal                                   |
| Abusive client                        | Token bucket per client address (`RATE_LIMIT_PER_MINUTE` 60, `RATE_LIMIT_BURST` 20); `RATE_LIMITED` with `retryAfter`; a failing bucket store fails open |
| Many readers behind one NAT           | They share one bucket; operators raise the limit. A CDN or WAF in front handles clients spread over many addresses                                       |
| Replicas                              | Postgres shares sessions, outbox and buckets; each replica keys buckets with its own secret, so the effective limit is up to one bucket per replica      |
| Deploy or scale-down                  | SIGTERM turns readiness off, drains in-flight requests for up to `SHUTDOWN_TIMEOUT_MS` (10 s), then runs a final metering export                         |

### Metering

| Edge case                           | Handling                                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Same event sent twice after a retry | Every event has an idempotency id; referral ids are a hash of kind, token and DOI, so a second tab or retried beacon dedupes |
| Exporter or webhook down            | Events wait in the outbox; exports retry with backoff up to `METER_BACKOFF_MAX_MS`; requests are never blocked               |
| Outbox write fails                  | Logged and counted, never thrown into the tool call                                                                          |
| Two exporters (replicas)            | Claims with leases (`FOR UPDATE SKIP LOCKED` on Postgres), so two never send the same batch; delivery is at least once       |
| Failed requests                     | Recorded with their code, marked non-billable                                                                                |
| Forged or replayed referral beacon  | Counted only for a live token whose results include the DOI; the journal comes from the index                                |

### Content safety

| Edge case                                      | Handling                                                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Prompt injection inside an abstract            | Card text returned in data fields and introduced as data; control characters stripped; descriptions mark it untrusted |
| Dosing or treatment questions                  | The server returns evidence pointers plus the notice; it never generates advice                                       |
| Retracted papers                               | Excluded from search by default; flagged by `get_article` and `cite`                                                  |
| Full text                                      | Used for matching only; never in tool output, teasers, `whyMatched` or the landing page's matched passage             |
| A clinician types patient details into a query | Query text is never logged, stored or put in a URL; logs carry its length only                                        |

### Links and landing pages

| Edge case                                                     | Handling                                                                                                                                              |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| The AI client hides, shortens or rewrites links               | Link in the Markdown title and in `url`; MCP Apps cards where supported; the funnel (cards shown against visits) shows when a client drops links      |
| The model answers from its own knowledge instead of the cards | Teaser stays short and descriptions ask for linked titles; this cannot be forced, so it is measured                                                   |
| Token expired (after 24 hours) or unknown                     | The page shows the article alone with an expiry notice; with no page at all, a link with a DOI redirects to doi.org (307)                             |
| Link forwarded to a colleague                                 | Works for anyone until expiry; the session holds only result DOIs, no personal data or query text                                                     |
| Query text would reveal patient details                       | Never in URLs or the session store; the landing API names the topic from the results' shared subjects                                                 |
| Link previews and crawlers inflate visits                     | Reading a page never counts or consumes a token; a visit counts only after a client beacon; preview agents, prefetch and cross-site posts are dropped |
| Duplicate pages hurting SEO                                   | Token pages are `noindex, nofollow` (meta and header) with the article's page as canonical                                                            |
| Paywalled article                                             | Landing page shows the abstract and the access actions from the entitlements adapter (sign in, buy)                                                   |
| Landing API down, rate-limited or invalid                     | A link with a DOI still goes to doi.org; only a link without a DOI reaches the error page                                                             |
| Session store or entitlements fail                            | The page falls back to the DOI, or to access from the record; related reading is dropped on failure                                                   |
| Tracking parameters stripped                                  | The token alone attributes the visit server-side                                                                                                      |
| Publisher page moved                                          | doi.org is the fallback link                                                                                                                          |

## Testing strategy

The test that proves plug-and-play is the shared contract suite in `packages/testkit`: every adapter of a port must pass the same tests, so swapping one in cannot break search or the tools.

| Layer             | What it covers                                                                                                                                                                                    | Tools                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Unit              | DOI normalisation, JATS cleaning, folding, licence gate, chunk boundaries and overlap, RRF and ordering, cursors, teasers, `whyMatched`, citations (snapshots)                                    | Vitest                                               |
| Property-based    | Any string as a query gives results or `INVALID_INPUT` and never fails a store; chunker never loses or duplicates text; no tool response leaks full text                                          | fast-check                                           |
| Adapter contracts | Article store, index storage, session store, sync state, usage outbox, rate buckets, embedder, source and enricher suites, run against in-memory fakes, SQLite, Postgres, Crossref and Europe PMC | Vitest, Testcontainers (pgvector image), msw         |
| Integration       | Ingest on recorded responses with injected 429, 5xx and timeouts; resume after a crash; verify and swap                                                                                           | msw fixtures                                         |
| MCP protocol      | Real wiring on in-memory adapters through the SDK client over HTTP and stdio: list tools, call each, validate outputs; `Host` and `Origin` rejections                                             | MCP SDK client                                       |
| HTTP edges        | Limits and malformed requests                                                                                                                                                                     | Fuzz tests (`http-edge.fuzz.test.ts`)                |
| Search quality    | Golden set of 60 queries (20 German, 20 English, 20 cross-language, abbreviation or compound) with graded judgments; recall@10, MRR, nDCG@10 against a committed baseline                         | `pnpm eval golden`                                   |
| Performance       | Search latency on a real index; tool-call throughput and latency at a fixed rate                                                                                                                  | `pnpm eval bench`, `docker/e2e/load.sh` (autocannon) |
| Security          | Dependency, image and Dockerfile scanning, static analysis, secret scanning                                                                                                                       | osv-scanner, Trivy, Semgrep, gitleaks                |
| End-to-end smoke  | Both images with the demo index, compose stack on SQLite and Postgres and the self-hosting bundle, every tool over HTTP                                                                           | `docker/e2e/smoke.sh`, `deploy-smoke.sh`             |
| Landing page      | Rendering, fallbacks, beacon once, noindex and canonical, desktop and mobile; WCAG 2.1 AA; LCP, CLS, accessibility and performance budgets; against a stub API with synthetic articles            | Playwright, axe, Lighthouse CI                       |

**Golden set** ([ADR 0026](adr/0026-golden-set-eval-and-tuning.md)): `packages/testkit/golden/golden-set.json`, versioned. Queries were written before results were seen and judged on title and abstract only, against a written rubric. No index is committed (it would publish article content); `corpus-dois.txt` lists the pooled articles, and `ingest subset` builds the eval index from a local live index.

**Search regression gate** ([ADR 0030](adr/0030-local-pre-push-eval-gate.md)): GitHub CI cannot hold the eval index, so a Git `pre-push` hook runs `eval golden --baseline` when a push touches ranking code (`packages/search`, `store-sqlite` and `embedder-onnx` sources, core chunking and text, the golden set). A change that lowers a score on purpose rewrites the baseline in the same commit.

**CI pipeline (GitHub Actions)**

1. `ci.yml`, job `check`: format check (Prettier), lint (ESLint, no warnings), type check, dependency rules (dependency-cruiser), then unit, property, contract and integration tests with the 85% line coverage gate. Postgres tests run on Testcontainers.
2. `ci.yml`, job `landing`: build the landing app, run Playwright and Lighthouse CI.
3. `ci.yml`, job `e2e`: restore the cached demo index, run the smoke tests on SQLite, Postgres and the self-hosting bundle.
4. `demo-index.yml`: builds and caches the CC BY demo index weekly and when its inputs change, including the licence check ([ADR 0049](adr/0049-fast-release-pipeline.md)).
5. `security.yml`: osv-scanner, Semgrep, gitleaks, Trivy on both images and the Dockerfiles and compose files, SBOMs; on push, pull request and weekly.
6. `release.yml`, on a tag: waits for CI on the tagged commit, builds both images natively per architecture, publishes multi-platform images to GHCR with provenance attestation and an SBOM.

## Security, compliance and guardrails

The server is read-only, holds no patient data by design and only uses official APIs, so the main risks are abuse, content rights and model misuse. Details in [SECURITY.md](SECURITY.md).

| Area             | Measure                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Access           | `/mcp` is public; no credential is read and no caller identity recorded ([ADR 0048](adr/0048-public-server-without-auth.md)). Tool calls are rate-limited per client address, keyed by an HMAC under a per-process secret (IPv6 by /64), so no address is stored or logged. With `HTTP_TRUSTED_PROXIES` the address comes from the right-most untrusted `X-Forwarded-For` hop. |
| Transport        | TLS at the proxy (Caddy in the self-hosting bundle); `Host` allowlist and `Origin` check; no CORS; URL 2 KB, headers 16 KB, body 64 KB. Config refuses HTTP beyond loopback without `HTTP_ALLOWED_HOSTS` and `LANDING_API_SECRET`.                                                                                                                                             |
| Landing API      | Bearer secret compared in constant time; `Host` allowlist; per-visitor rate limit keyed by a salted hash of the reader's address; optionally on its own internal port (`LANDING_API_PORT`)                                                                                                                                                                                     |
| Least privilege  | Postgres server role reads committed index schemas and writes only sessions, outbox and buckets; the ingest uses a separate writer role. Images are distroless, non-root (uid 65532), read-only root filesystem; `/metrics` can move to an internal port.                                                                                                                      |
| Secrets          | Environment or mounted files (`<NAME>_FILE` for listed secrets); redacted in logs                                                                                                                                                                                                                                                                                              |
| Privacy (GDPR)   | No query text in logs, URLs, sessions, events or metric labels; the embedding cache is keyed by a hash; usage events carry tool, counts, latency and journals only                                                                                                                                                                                                             |
| Content rights   | Official APIs only (Crossref, Europe PMC), no scraping; full text for matching only under `FULLTEXT_LICENSE_ALLOWLIST` (CC BY 4.0 and CC BY-NC-ND 4.0 by default), purgeable by licence; attribution required by the card schema; "not for model training" in the server instructions; the published image carries only a CC BY demo index                                     |
| Medical safety   | No generated advice; notice on every response; retracted papers excluded; publication year shown so the model can judge recency                                                                                                                                                                                                                                                |
| Prompt injection | Article text returned as data fields and introduced as data; control characters stripped; descriptions mark it untrusted                                                                                                                                                                                                                                                       |
| Supply chain     | Frozen lockfile, actions pinned by commit, Dependabot, osv-scanner, Trivy, SBOM and provenance per release, checksummed sqlite-vec source in the image                                                                                                                                                                                                                         |
| Branding         | "Independent prototype, not affiliated with Thieme" in the README, server instructions and every response; no Thieme logo or branding claims                                                                                                                                                                                                                                   |
| Landing tokens   | Random 128-bit, 24-hour expiry, rate-limited lookup, no query text stored or put in URLs; a token grants nothing beyond showing public metadata                                                                                                                                                                                                                                |

## Engineering standards

Simple first: small modules with one job each, dependencies pointing inward to a pure core, and every rule below enforced by tooling where possible.

### Principles

| Principle                         | What it means in this repo                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| KISS                              | The simplest thing that passes the tests. No framework where a function will do; no DI container, no class hierarchies, no generic "utils" layer |
| YAGNI                             | An abstraction needs a second real use. The exceptions are the ports, which exist because adapters are swapped by design                         |
| Single responsibility             | One exported concept per file; a file that needs "and" in its description is split                                                               |
| Open/closed                       | New sources, stores or citation styles are added as new adapters, without editing search or tool code                                            |
| Liskov                            | Every adapter passes the same contract suite as its siblings; if it cannot, the port is wrong                                                    |
| Interface segregation             | Small, role-specific ports (`ArticleReader`, `ArticleWriter`, `ArticleSearch`) rather than one large repository                                  |
| Dependency inversion              | Core defines the ports; adapters implement them; only composition roots create concrete adapters                                                 |
| Composition over inheritance      | Functions and plain objects; no `extends` (lint rule)                                                                                            |
| Functional core, imperative shell | Ranking, fusion, chunking, teasers, citations and the funnel count are pure functions; I/O lives in adapters and apps                            |

### Repository layout

```
scholarly-mcp/
  packages/
    core/              domain types, zod schemas, ports, errors, chunking, text, landing and metering models
    search/            search service: query planning, language lanes, RRF, collapse, teasers, cursors
    lexical/           folding and Snowball stemming shared by both stores
    source-crossref/   Crossref source (metadata, abstracts, licences, retractions)
    source-europepmc/  Europe PMC enricher (subjects, matching-only full text)
    store-sqlite/      SQLite index and runtime files, search workers
    store-postgres/    Postgres index schemas, runtime tables, migrations
    embedder-onnx/     ONNX embedder via transformers.js (multilingual-e5-small by default)
    cite/              CSL citations
    card-view/         MCP Apps card list (browser code built into one HTML page)
    http/              shared HTTP client with retries and spacing
    logger/            pino logger with redaction
    testkit/           contract suites, fakes, builders, fixtures, golden set
  apps/
    server/            MCP server: tools, landing API, rate limits, metering, funnel, telemetry
    ingest/            ingest CLI
    eval/              golden-set eval and search bench
    landing/           Next.js reference landing page
  presets/             Thieme preset: env, demo DOI list, journal subjects
  docker/              server and landing images, Postgres init, demo index build, E2E scripts
  deploy/              self-hosting bundle (compose, Caddy, env example)
  compose.yaml         development stack (sqlite, postgres, landing, tools profiles)
  docs/                guides, operations, security, ADRs
```

### Repository and layering

- pnpm workspaces, Node 24 LTS, ESM only, TypeScript 5 with `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Turborepo for cached builds across packages.
- Dependency direction is enforced in CI with dependency-cruiser (`.dependency-cruiser.cjs`):

| Layer                                        | May import                          | Must not import                                                                    |
| -------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| `packages/core`                              | zod and the standard library        | any other package, Node I/O built-ins (`fs`, `http`, `net`, …)                     |
| `packages/search`                            | `core`, zod                         | adapters, apps, Node I/O built-ins                                                 |
| `packages/lexical`                           | `core`, snowball-stemmers           | anything else                                                                      |
| `packages/cite`                              | `core`, zod, citation-js            | adapters, search, logger, http, testkit, apps                                      |
| `packages/card-view`                         | `core` types, the MCP Apps SDK      | adapters, search, logger, http, cite, testkit, apps                                |
| `packages/logger`, `packages/http`           | `core` (and pino for the logger)    | adapters, testkit, apps                                                            |
| `packages/source-*`, `store-*`, `embedder-*` | `core`, `lexical`, `http`           | other adapters, apps                                                               |
| `packages/testkit`                           | `core` and packages under test      | apps; only test files may import testkit                                           |
| `apps/*`                                     | packages                            | each other                                                                         |
| `apps/landing`                               | `core`, `logger` (testkit in tests) | the index, search or any adapter; hooks and model code must not import server code |

No circular dependencies anywhere.

### Backend conventions

- **Feature folders inside packages**, one concept per file, kebab-case names: `search/src/rank/rrf.ts`, `collapse-to-articles.ts`, `present/build-teaser.ts`. Aim for under about 200 lines per file and 40 per function.
- **Named exports only** (lint rule; Next.js route files and config files excepted); one `index.ts` barrel per package root, none deeper.
- **Ports are small TypeScript interfaces in core**, for example:

```ts
export interface ArticleSearch {
  lexical(query: LexicalQuery, signal: AbortSignal): Promise<RankedChunk[]>;
  vector(query: VectorQuery, signal: AbortSignal): Promise<VectorChunk[]>;
}

export interface SessionStore {
  save(session: LandingSession, signal: AbortSignal): Promise<void>;
  find(token: Token, signal: AbortSignal): Promise<LandingSession | undefined>;
  recordVisit(token: Token, signal: AbortSignal): Promise<void>;
  deleteExpired(now: Date, signal: AbortSignal): Promise<number>;
}
```

- **Factories, not classes**, for services: `createSearchService({ reader, search, embedder, clock, logger })` returns an object of functions. Dependencies are passed in, never imported, so tests pass fakes.
- **One composition root per app** (`apps/server/src/main.ts`, `apps/ingest/src/main.ts`, `apps/eval/src/main.ts`) reads config, creates adapters and wires services. Nothing else creates concrete adapters.
- **Validate at the edges** with zod (config, HTTP input, source records, tool input and output, landing API); inside core, trust the types.
- **Errors:** one `AppError` type with a stable `code`; adapters translate low-level errors into it; the tool layer maps codes to MCP errors in one place. Never swallow an error; never leak a stack trace.
- **Async hygiene:** every I/O call takes an `AbortSignal`; `no-floating-promises` is on.
- **Logging:** pino through `packages/logger`, structured, with request id; `no-console` is on; never log query text or secrets (redaction paths enforce it for known fields).
- **Time and randomness are dependencies** (`Clock`, `RandomToken`), so tests are deterministic.
- **Types:** no `any`, no `@ts-ignore` (lint rules).
- **Comments explain why, not what.** TSDoc on exported functions and ports.

### React and Next.js conventions

The reference landing page (`apps/landing`, [ADR 0032](adr/0032-landing-api-and-reference-landing-page.md), [ADR 0046](adr/0046-focused-reference-landing-page.md)) renders one article per page from the landing API's page model.

- Next.js App Router, Server Components by default; `'use client'` only on interactive leaves (referral beacon, action tracker, expandable abstract, error view).
- **Route files stay thin**: `page.tsx` fetches through a server function and renders one feature component, with `error.tsx` and `not-found.tsx`. The landing route has no `loading.tsx`: streaming would fix the status at 200 and turn the doi.org redirect into a meta refresh.
- **Feature-based structure**, one component per file:

```
apps/landing/src/
  app/mcp/landing/
    page.tsx               thin: resolve token, render <LandingView>
    error.tsx, not-found.tsx
    visit/route.ts         filters previews, forwards a visit to the landing API
    action/route.ts        the same for access button clicks
  features/landing/
    components/            landing-view, chosen-article, matched-passage, access-options,
                           related-reading, referral-beacon, action-tracker, ...
    hooks/                 use-referral-beacon, use-action-beacon, use-expandable
    server/                import 'server-only'; calls the landing API
    model/                 pure helpers (landing params, prefetch detection, visit rules)
    lib/                   send-beacon
  shared/
    ui/                    badge, button-link: design-system primitives
    lib/                   env, messages (de, en), cx
```

- **Components are presentational**: props in, JSX out, under about 150 lines, no data fetching or business rules in leaf components.
- **Business logic lives in hooks** (client) or `server/` functions (server). A hook returns state and actions, never JSX, and is tested with `renderHook`. Access is decided on the server per request.
- **State:** derive, don't duplicate; keep state close to where it is used; no global store. More than two levels of prop passing means composition (`children`) instead.
- **Lists** keyed by DOI, never by index.
- **Styling:** CSS Modules on design tokens (CSS variables in `globals.css`), so it maps onto a publisher's design system; light and dark follow the system; no inline styles, no web fonts.
- **Accessibility:** semantic HTML, visible focus, keyboard-only flows work, axe clean (WCAG 2.1 AA).
- **SEO:** `generateMetadata` sets `noindex, nofollow` and the article's page as canonical on token pages.

### Testing standards

- Test behaviour, not implementation; names read as sentences ("returns the article page when the token has expired").
- Arrange, act, assert; one behaviour per test.
- Test-data builders in `testkit` (`anArticle()`, `aChunk()`, `aLandingSession()`) instead of large fixtures.
- No network in unit tests; recorded fixtures (msw) for sources; Testcontainers for Postgres.
- Every port has a contract suite; every adapter runs it.
- React: Testing Library queries by role and label; Playwright for end-to-end flows.

### Git and review workflow

- Trunk-based: short-lived branches, pull requests under about 400 changed lines.
- Conventional Commits, checked by commitlint on `commit-msg`; Husky and lint-staged run Prettier and ESLint on staged files before each commit; `pre-push` runs the search regression gate.
- PR template: what changed, why, how it was tested, which edge cases it covers, which ADR it adds.
- Changesets for versions and the changelog; images tagged with the semantic version.
- Decisions that change the design get an ADR in `docs/adr/`.
