# 0034 Postgres store adapter

- Status: accepted
- Date: 2026-11-03
- Records: SM-13; builds on ADR 0009 (SQLite default, Postgres for production), ADR 0022 (index files and builds), ADR 0031 (outbox), ADR 0032 (sessions), ADR 0033 (event envelope)

## Context

ADR 0009 promised a Postgres adapter behind the same ports and the same contract suites. Since then the SQLite store has grown behaviour the Postgres one must match, not just tables: Snowball stemming of folded words in TypeScript, a trigram top-up that only counts compound edges, an exact filtered vector scan, builds that are verified before they go live, and a runtime database with sessions, API keys and the outbox. The exit check asks for golden-set results within 2 points of SQLite, so the two stores must rank alike, not just store alike.

Two things only matter once there are several server replicas. Sessions must be shared, so a landing link works on any replica (ADR 0032). Several exporters must not resend each other's batches (ADR 0031).

## Decision

1. **Package.** `packages/store-postgres` uses `pg` (node-postgres) with a pool. It implements the same ports as `store-sqlite`: the article reader, writer, search, journals, sync state, sessions, API keys and the outbox. It passes the same testkit contracts, run on Testcontainers with the pinned `pgvector/pgvector:0.8.7-pg18-trixie` image.
2. **One stemmer for both stores.** The folding and Snowball code moves from `store-sqlite` to a new `packages/lexical` (core and `snowball-stemmers` only). Both stores call it at write and at query time, so a word is stemmed the same way whichever store holds it. This replaces PLAN.md's per-row `regconfig`: Postgres's built-in `german` config neither folds "ä" to "ae" nor stems unknown-language rows in both languages, and the eval measured both choices for SQLite (ADR 0026).
3. **Lexical search.** Each chunk row holds `text_stemmed`, `text_folded` and `title_stemmed` as written by `packages/lexical`. A generated `tsv` column weights them with the `simple` config (title A, stemmed text B, folded text C), with a GIN index. The query is built from the port's already-tokenised terms, which `packages/lexical` reduces to letters and digits, and passed as one bound parameter to `to_tsquery('simple', …)`, any word matching (OR). Each word's `ts_rank`, with the same weight ratio as SQLite's BM25 (2.0, 1.0, 0.5, halved to 1.0, 0.5 and 0.25 because `ts_rank` takes weights up to 1) and no length normalisation, is multiplied by the word's BM25 inverse document frequency, and the products are summed. Each build keeps a `term_stats` table (chunks per lexeme, from `ts_stat` at commit) for those weights. Only words in at most 5 % of chunks pick the candidates, unless every word is that common; common words still add to the score. PLAN.md's `websearch_to_tsquery` is not needed, because raw input never reaches the store. The compound top-up uses `pg_trgm` on the folded title and text, with the same compound-edge check from `packages/lexical`.
4. **Vector search.** `embedding vector(<dimensions>)`, sized by the embedding model (ADR 0028), with an HNSW index on `vector_cosine_ops`. Filters sit on the chunk row, as on SQLite's `vec_chunks`. Queries set `hnsw.iterative_scan = strict_order` and `hnsw.ef_search` 400, so a filter never cuts a result list short. The golden set measures the gap to SQLite's exact scan.
5. **Builds and swaps.** Each build is its own schema, `index_<build id>`. A control schema `scholarly` holds the runtime tables, the migration log, the build in progress and a one-row `live_index` pointer. A full build starts from an empty schema. An incremental build or a purge copies the live schema inside the database first. Commit verifies the build, writes its `IndexMeta` and flips the pointer in one transaction. The server reads the pointer on its refresh tick and moves to the new schema, as it reopens a swapped SQLite file. The schema before the previous one is dropped at commit, so a query still running on the previous index finishes. A leftover build of the same kind and vector size is resumed.
6. **Migrations.** The runtime tables use versioned, append-only SQL migrations recorded in `scholarly.migrations`, taken under an advisory lock so two processes starting together do not race. The index schema is not migrated. Like the SQLite file layout, it carries a layout version, and a build with an older layout is rebuilt by a full run.
7. **Roles.** The ingest connects as a writer that owns the index schemas. The server connects as a role with `SELECT` on index schemas, granted on each build when it is committed (so a build in progress stays invisible to it), and with read and write access only to sessions and the outbox and read access to API keys. The keys command uses the writer. Role names come from config, and the compose profile creates both roles.
8. **Outbox claiming.** The port's `pending` becomes `claim(limit, now, leaseUntil)`, with a new `release(ids)`. A claim takes unexported events whose lease has run out, oldest first, and sets their lease. Postgres selects them `FOR UPDATE SKIP LOCKED`, so two exporters never take the same row. SQLite gets the same `claimed_until` column in runtime migration 4, and its write lock makes a claim atomic. `markExported` ends the claim. The exporter releases a batch a sink refused, so its own retry does not wait out the lease. A crashed exporter's lease runs out and another takes over. Delivery stays at least once.
9. **Event storage.** The Postgres outbox has the SQLite migration 3 shape: `id, kind, api_key_id, occurred_at, exported_at, claimed_until`, and the kind's fields in a `jsonb` `payload`. Sessions keep their optional `tool`.
10. **Selecting a store.** `STORE=sqlite|postgres` picks the adapter in the server, the ingest and the eval. `DATABASE_URL` is the connection string; SQLite stays the default. The server's index reader becomes asynchronous (`open` and `refresh` return promises) for both stores. The ingest reaches both stores through one `IndexStorage` port in core (open the live index, begin, verify, commit, keep or discard a build), so each command is written once, and testkit's `runIndexStorageContract` holds both adapters to it. `ingest migrate` applies the runtime migrations and grants `PG_SERVER_ROLE`; the server and the keys command refuse a database it has not migrated.

## Consequences

- Moving the stemmer changes no SQLite ranking. The SQLite contract and golden gates must stay exactly as they were.
- `ts_rank` is not BM25, and HNSW is approximate. The SM-13 exit eval (below) measured both and settled decisions 3 and 4.
- A build commits a few seconds later, for `ts_stat` (about 4 s on the 176k-chunk corpus). `term_stats` came with index layout 2, so a layout 1 schema needs a full build or `ingest copy`.

## Exit eval (2026-11-03)

Golden set version 2 on the eval index (2,959 articles, 15,946 chunks), loaded into Postgres with `ingest copy`. Recall@10 / MRR / nDCG@10:

| Store                                   | Overall           | de                | en                | cross             |
| --------------------------------------- | ----------------- | ----------------- | ----------------- | ----------------- |
| SQLite                                  | 0.680/0.888/0.627 | 0.566/0.824/0.489 | 0.873/0.950/0.807 | 0.600/0.892/0.585 |
| Postgres, first cut (`ts_rank`, ef 200) | 0.665/0.869/0.618 | 0.536/0.791/0.467 | 0.863/0.942/0.798 | 0.596/0.875/0.590 |
| Postgres, as decided                    | 0.684/0.881/0.633 | 0.583/0.802/0.518 | 0.855/0.950/0.783 | 0.613/0.892/0.597 |

Swapping one side at a time showed where the first cut lost. The lexical side cost the whole German gap, because `ts_rank` has no inverse document frequency, so a common word repeated outranked a rare one. Weighting each word by its IDF closed it, and normalisation 0 beat 1, 2 and 8. The vector side lost 0.8 recall points to the HNSW approximation at `ef_search` 200. At 400 it matched an exact scan on every query. Overall scores are now within a point of SQLite: the exit criterion is met.

Latency on the full corpus (70,911 articles, 176,433 chunks; `eval bench`, 225 searches, same machine):

| Store                        | p50    | p95    | Slowest group p95 |
| ---------------------------- | ------ | ------ | ----------------- |
| SQLite                       | 221 ms | 312 ms | 349 ms (de)       |
| Postgres, IDF on every match | 226 ms | 748 ms | 826 ms (en)       |
| Postgres, as decided         | 68 ms  | 259 ms | 440 ms (filtered) |

Ranking every chunk that holds a common word was the cost: "patients" matches 67k chunks, and counting each word's chunks on the fly took another 375 ms. Precounted `term_stats` and candidates picked by the rarer words removed both. Matching only words under 5 % (or 2 %) changed no golden score.

- The outbox port changes for every adapter and the in-memory fake. The contract gains claim, lease and release cases.
- A build copies the live index inside Postgres, so an incremental run needs room for two copies, as on SQLite.
- Sessions in Postgres make landing links work across replicas. The per-caller rate limits stay per process (ADR 0031), an SM-14 follow-up.
