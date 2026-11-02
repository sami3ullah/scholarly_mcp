# @scholarly-mcp/store-sqlite

The default store (key design decision 4): one SQLite file per index with FTS5, a trigram FTS table and sqlite-vec, plus a separate runtime file for landing sessions and the metering outbox. Implements `ArticleReader`, `ArticleWriter`, `ArticleSearch`, `SyncStateStore` and `SessionStore`, and passes their shared contracts. Design rules: [ADR 0022](../../docs/adr/0022-sqlite-index-files-and-builds.md).

## Configuration

| Variable          | Default               | Meaning                                                                      |
| ----------------- | --------------------- | ---------------------------------------------------------------------------- |
| `INDEX_PATH`      | `data/index.sqlite`   | The live index; builds go to `<INDEX_PATH>.building` and are renamed over it |
| `RUNTIME_DB_PATH` | `data/runtime.sqlite` | Landing sessions and usage events; the server writes it                      |

## Files

| File    | Tables                                                                                         | Written by                             |
| ------- | ---------------------------------------------------------------------------------------------- | -------------------------------------- |
| Index   | `articles`, `chunks`, `chunks_fts`, `chunks_trigram`, `vec_chunks`, `index_meta`, `sync_state` | ingest only (read-only for the server) |
| Runtime | `landing_sessions`, `usage_events`                                                             | server                                 |

## Usage

```ts
// Ingest: build, verify, swap.
const build = beginIndexBuild({ indexPath, kind: 'incremental', now: clock.now() });
await build.store.writer.upsert(records, signal);
const report = await verifyIndex(build.db, { modelVersion: embedder.modelVersion }, signal);
if (report.ok) build.commit(meta);

// Server: read-only, follows swaps.
const index = openIndexReader(indexPath, embedder.modelVersion);
setInterval(() => index.refresh(), 30_000);
await index.journals.journals(signal); // every journal, built from its articles
```

`journals` tallies articles per journal name and ISSN pair with two aggregate queries (about 0.4 s on the 70k-article index; callers cache it per index version), and core's `mergeJournalTallies` joins tallies sharing an ISSN ([ADR 0025](../../docs/adr/0025-mcp-server-and-tool-rules.md)).

## Text matching

German has no FTS5 stemmer, so text is folded (`ä` to `ae`, `ß` to `ss`, other diacritics removed) and Snowball-stemmed in TypeScript before it reaches FTS5, at index and at query time alike. Each chunk row also carries its article's title. Query words are reduced to letters and digits and quoted, so FTS syntax in user input is plain text. A lexical query may carry the query's language; its words are then stemmed in that language only, otherwise in German and English.
