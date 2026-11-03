import {
  fromJsonWithDates,
  syncStateSchema,
  toJsonWithDates,
  type ArticleReader,
  type ArticleRecord,
  type ArticleSearch,
  type ArticleWriter,
  type Doi,
  type JournalDirectory,
  type SyncStateStore,
} from '@scholarly-mcp/core';
import { CHUNK_COLUMNS, articleFromRecord, chunkFromRow, type ChunkRow } from './articles/rows.js';
import { createRecordWriter, type PurgeCounts } from './articles/write-records.js';
import { readIndexMeta, writeIndexMeta } from './database/index-meta-row.js';
import type { Db } from './database/open-database.js';
import { createJournalDirectory } from './journals/create-journal-directory.js';
import { createSqliteSearch } from './search/create-sqlite-search.js';
import { withSignal } from './with-signal.js';

/** Every face of an index file. The server uses only `reader`, `search` and `journals`. */
export interface SqliteIndexStore {
  readonly reader: ArticleReader;
  readonly writer: ArticleWriter;
  readonly search: ArticleSearch;
  readonly journals: JournalDirectory;
  readonly syncState: SyncStateStore;
  /** An article with all its chunks, so a rebuild can reuse embeddings of unchanged articles. */
  findRecord(doi: Doi, signal: AbortSignal): Promise<ArticleRecord | undefined>;
  /**
   * Removes all full text indexed under a licence, in one transaction, e.g. when a rights
   * holder asks (ADR 0003). Only a purge build calls it; the live index is never written.
   */
  purgeFullText(licenseUrl: string, signal: AbortSignal): Promise<PurgeCounts>;
}

/** Wraps an open index database, with the schema already created, in the store ports. */
export function createSqliteIndexStore(db: Db): SqliteIndexStore {
  const records = createRecordWriter(db);
  const articleByDoi = db.prepare<[string], { record: string }>(
    'SELECT record FROM articles WHERE doi = ?',
  );
  const chunkById = db.prepare<[string], ChunkRow>(
    `SELECT ${CHUNK_COLUMNS} FROM chunks c JOIN vec_chunks v ON v.rowid = c.rowid WHERE c.id = ?`,
  );
  const chunksByDoi = db.prepare<[string], ChunkRow>(
    `SELECT ${CHUNK_COLUMNS} FROM chunks c JOIN vec_chunks v ON v.rowid = c.rowid
     WHERE c.doi = ? ORDER BY c.ordinal`,
  );
  const hashByDoi = db.prepare<[string], { content_hash: string }>(
    'SELECT content_hash FROM articles WHERE doi = ?',
  );
  const readSync = db.prepare<[string], { record: string }>(
    'SELECT record FROM sync_state WHERE source = ?',
  );
  const writeSync = db.prepare('INSERT OR REPLACE INTO sync_state (source, record) VALUES (?, ?)');
  const upsertAll = db.transaction((batch: readonly ArticleRecord[]) => {
    records.check(batch);
    for (const record of batch) records.put(record);
  });
  const removeOne = db.transaction((doi: Doi) => {
    records.remove(doi);
  });
  const purgeAll = db.transaction((licenseUrl: string) => records.purgeFullText(licenseUrl));

  const findArticle = (doi: string) => {
    const row = articleByDoi.get(doi);
    return row === undefined ? undefined : articleFromRecord(row.record);
  };

  return {
    reader: {
      findByDoi: (doi, signal) => withSignal(signal, () => findArticle(doi)),
      findManyByDoi: (dois, signal) =>
        withSignal(signal, () => dois.flatMap((doi) => findArticle(doi) ?? [])),
      findChunks: (ids, signal) =>
        withSignal(signal, () =>
          ids.flatMap((id) => {
            const row = chunkById.get(id);
            return row === undefined ? [] : [chunkFromRow(row)];
          }),
        ),
      findArticleChunks: (doi, signal) =>
        withSignal(signal, () => chunksByDoi.all(doi).map(chunkFromRow)),
      indexMeta: (signal) => withSignal(signal, () => readIndexMeta(db)),
    },
    writer: {
      upsert: (batch, signal) =>
        withSignal(signal, () => {
          upsertAll(batch);
        }),
      remove: (doi, signal) =>
        withSignal(signal, () => {
          removeOne(doi);
        }),
      contentHashOf: (doi, signal) => withSignal(signal, () => hashByDoi.get(doi)?.content_hash),
      writeIndexMeta: (meta, signal) =>
        withSignal(signal, () => {
          writeIndexMeta(db, meta);
        }),
    },
    search: createSqliteSearch(db),
    journals: createJournalDirectory(db),
    syncState: {
      load: (source, signal) =>
        withSignal(signal, () => {
          const row = readSync.get(source);
          return row === undefined
            ? undefined
            : syncStateSchema.parse(fromJsonWithDates(row.record));
        }),
      save: (state, signal) =>
        withSignal(signal, () => {
          writeSync.run(state.source, toJsonWithDates(state));
        }),
    },
    findRecord: (doi, signal) =>
      withSignal(signal, () => {
        const article = findArticle(doi);
        if (article === undefined) return undefined;
        return { article, chunks: chunksByDoi.all(doi).map(chunkFromRow) };
      }),
    purgeFullText: (licenseUrl, signal) => withSignal(signal, () => purgeAll(licenseUrl)),
  };
}
