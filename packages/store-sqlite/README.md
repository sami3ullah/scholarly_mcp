# @scholarly-mcp/store-sqlite

The default store (key design decision 4): one SQLite file per index with FTS5, a trigram FTS table and sqlite-vec, plus a separate runtime file for landing sessions and the metering outbox. Implements `ArticleReader`, `ArticleWriter`, `ArticleSearch`, `SyncStateStore`, `IndexStorage`, `SessionStore` and `UsageOutbox`, and passes their shared contracts. Design rules: [ADR 0022](../../docs/adr/0022-sqlite-index-files-and-builds.md).

## Configuration

| Variable                | Default               | Meaning                                                                                                                                                                                            |
| ----------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INDEX_PATH`            | `data/index.sqlite`   | The live index; builds go to `<INDEX_PATH>.building` and are renamed over it                                                                                                                       |
| `RUNTIME_DB_PATH`       | `data/runtime.sqlite` | Landing sessions and usage events; the server writes it                                                                                                                                            |
| `SQLITE_SEARCH_WORKERS` | `2`                   | Worker threads that run the server's searches, each on its own connection; about one per CPU, `0` runs them on the event loop ([ADR 0041](../../docs/adr/0041-sqlite-search-on-worker-threads.md)) |

## Files

| File    | Tables                                                                                                        | Written by                             |
| ------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Index   | `articles`, `chunks`, `chunks_fts`, `chunks_trigram`, `vec_chunks`, `index_meta`, `sync_state`, `index_build` | ingest only (read-only for the server) |
| Runtime | `landing_sessions`, `usage_events`                                                                            | server                                 |

## Usage

```ts
// Ingest: build, verify, swap, through core's IndexStorage port (ADR 0034).
const storage = createSqliteIndexStorage(indexPath);
const build = await storage.beginBuild(
  { kind: 'incremental', now: clock.now(), dimensions: embedder.dimensions },
  signal,
);
await build.store.writer.upsert(records, signal);
const report = await build.verify({ modelVersion: embedder.modelVersion }, signal);
if (report.ok) await build.commit(meta, signal);

// Server: read-only, follows swaps.
const index = await openIndexReader(indexPath, embedder.modelVersion, signal);
setInterval(() => void index.refresh(AbortSignal.timeout(20_000)), 30_000);
await index.journals.journals(signal); // every journal, built from its articles
```

`beginIndexBuild` and `verifyIndex` remain for code that needs the build's database handle; the storage port wraps them.

`journals` tallies articles per journal name and ISSN pair with two aggregate queries (about 0.4 s on the 70k-article index; callers cache it per index version), and core's `mergeJournalTallies` joins tallies sharing an ISSN ([ADR 0025](../../docs/adr/0025-mcp-server-and-tool-rules.md)).

## Text matching

German has no FTS5 stemmer, so text is folded (`ä` to `ae`, `ß` to `ss`, other diacritics removed) and Snowball-stemmed in TypeScript before it reaches FTS5, at index and at query time alike. Each chunk row also carries its article's title. Query words are reduced to letters and digits and quoted, so FTS syntax in user input is plain text. A lexical query may carry the query's language; its words are then stemmed in that language only, otherwise in German and English.
