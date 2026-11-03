# 0022 SQLite index files, text matching and builds

- Status: accepted, amended by ADR 0040 (the vector scan ranks by Euclidean distance on a mapped file)
- Date: 2026-11-02
- Fills gaps in: PLAN.md "SQLite store (default)", "Crash halfway through a run", key design decisions #3 and #4, ticket SM-05; settles the open question in ADR 0021 about article language

## Context

The plan lists the SQLite tables and says the index is built into a new file, verified and renamed into place. It does not say where checkpoints and landing sessions live when the index file is replaced, how a crashed build resumes, how full runs avoid re-embedding the corpus, or how German text is matched without a German FTS5 stemmer. Facts found while building it:

- The Thieme 2024+ corpus is 71,534 journal articles (Crossref, 2026-11-02), about 1.4 times the plan's estimate.
- better-sqlite3 13 ships prebuilt binaries for macOS, Linux (glibc and musl) and Windows; letting pnpm run its install script fails without node-gyp, so it is not in `onlyBuiltDependencies`.
- SQLite 3.53 (bundled) supports contentless FTS5 tables with deletes and a trigram tokenizer with `remove_diacritics`.
- The Snowball German stemmer maps "Ärzte" to `arzt` but "Aerzte" to `aerzt`, so stemming alone does not make the umlaut spellings meet.
- sqlite-vec KNN queries filter only on its own metadata columns; ISSN filters need an OR across two columns.
- On the real index (89,388 chunks, Apple M-series), an exact cosine scan over a vec0 table joined to `articles` took 1.2 s per query. A vec0 scan alone took 530 ms, the same vectors in a plain BLOB table 33 ms, and that table carrying the article's filter columns (no joins until the top 50) 61 ms unfiltered and 32-40 ms filtered. vec0 KNN took 11-23 ms but cannot express the ISSN filter.

## Decision

1. **Two files.** The index file holds `articles`, `chunks`, `chunks_fts`, `chunks_trigram`, `vec_chunks`, `index_meta` and `sync_state`; only the ingest writes it and the server opens it read-only. A runtime file holds `landing_sessions` and `usage_events`, which the server writes (WAL mode) and which must survive index swaps.
2. **Checkpoints live in the index file being built.** A page's articles and the checkpoint after it land in the same file, so a crash can never leave a checkpoint ahead of the data. A build is written to `<INDEX_PATH>.building`. A leftover build of the same kind (full or incremental) and schema version is resumed from its cursor; any other leftover is deleted.
3. **Full runs start from an empty file; incremental runs from a `VACUUM INTO` copy of the live index.** A full run reuses the live index's chunks and vectors for articles whose `contentHash` and model version are unchanged, so it re-fetches everything but embeds only what changed. Articles that disappeared upstream disappear from the index on full runs. An incremental run skips unchanged records, so a repeated run writes 0 rows.
4. **Full runs are scheduled by the ingest itself.** `SyncState.lastFullRunAt` records the last successful full run; `ingest incremental` becomes a full run when it is older than `INGEST_FULL_RUN_DAYS` (default 7), when there is no index yet, or when the index has an older layout (`INDEX_SCHEMA_VERSION`). A scheduler only ever runs `ingest incremental`. Embeddings are reused only from an index of the current layout.
5. **Verify, then swap.** Before the rename: `quick_check`, FTS5 integrity checks, at least one article, a chunk for every article and a vector for every chunk, one model version equal to the embedder's, no shrink of more than 10% against the live index, and sample queries (each sampled article found by its title words; each sampled chunk found by its own vector, both in the top 10). A build that fails verification is deleted and the live index is left alone. The committed file is switched to `journal_mode=DELETE` and vacuumed, so it is one self-contained file.
6. **The server follows swaps.** `openIndexReader` opens read-only, refuses an index with another model version or without `index_meta` (`INDEX_UNAVAILABLE`), and `refresh()` reopens when `IndexMeta.version` changed, keeping the current index when the new one is unusable.
7. **Text matching.** Text is folded (lowercase, `ä ö ü ß` to `ae oe ue ss`, other diacritics removed), split into letter and digit runs and Snowball-stemmed in TypeScript in the chunk's language, or in both German and English when unknown. Folding before stemming makes "Ärzte" and "Aerzte" share a stem. `chunks_fts` has `text_stemmed`, `text_folded` and `title_stemmed`: the article title is in every chunk's row, so title words find articles whose abstract does not repeat them. Query words get both stems and their folded form, quoted; words are ORed and BM25 ranks (weights 1, 0.5, 2 as a starting point for SM-08). `chunks_trigram` holds folded title and text; when the main table returns fewer hits than the limit, stems of 4+ letters are matched as substrings and their hits appended, which finds compounds such as "Vorhofflimmertherapie" from "Vorhofflimmern".
8. **Vector search is an exact cosine scan of a plain table,** not a vec0 table. `vec_chunks` holds each chunk's vector plus its article's filter columns (language resolved per chunk, year, ISSNs, open access, retracted), written in the same transaction as the article. The scan filters and ranks that one table with sqlite-vec's `vec_distance_cosine` and joins `chunks` only for the top results, so filters never cut a top-k short and every filter, including the ISSN OR, is exact. Lexical search filters through the same table, so both sides share one filter SQL. Chunks with cosine 0 or below are not returned, as in the in-memory store.
9. **Article language stays as declared.** The article's `language` is Crossref's value and is not rewritten from its chunks, because the index never alters source metadata; the language filter matches a chunk's own language and falls back to the article's, so it applies to the passage that matched. This answers ADR 0021's open consequence.

## Consequences

- Sessions and metering survive every index rebuild; the runtime file has its own append-only migrations.
- A full run still re-fetches all records from Crossref (about 72 pages of 1,000), but embedding cost is paid once per changed article.
- Changing stemming, folding or the table layout requires bumping `INDEX_SCHEMA_VERSION`; incremental runs then refuse the old file and a full run rebuilds it.
- The exact scan grows linearly with chunks: through the store port it measured 95 ms p95 unfiltered and 51 ms filtered at 90k chunks (layout 2, 551 MB file), so roughly 0.7 s at 1M. Past that, sqlite-vec KNN with metadata columns (and a second query per ISSN column) or the Postgres adapter with HNSW is the way out.
- sqlite-vec is used only for its distance function, which removes the pre-1.0 vec0 storage format from the risk list in ADR 0009.
- A language filter of `de` excludes an article declared German whose matching passage is English; the card still shows the declared language.
- Amended by ADR 0044: `vec_chunks_by_language` indexes the passage language without a layout bump; every build commit adds it to a file that lacks it.
