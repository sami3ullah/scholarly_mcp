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
```

## Text matching

German has no FTS5 stemmer, so text is folded (`ä` to `ae`, `ß` to `ss`, other diacritics removed) and Snowball-stemmed in TypeScript before it reaches FTS5, at index and at query time alike. Each chunk row also carries its article's title. Query words are reduced to letters and digits and quoted, so FTS syntax in user input is plain text.
