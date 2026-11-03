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
import {
  purgeFullText,
  putRecords,
  removeRecord,
  type PurgeCounts,
} from './articles/write-records.js';
import { readIndexMeta, writeIndexMeta } from './database/index-meta-row.js';
import { identifier, inTransaction, query, type Pool } from './database/pool.js';
import { createJournalDirectory } from './journals/create-journal-directory.js';
import { createPostgresSearch } from './search/create-postgres-search.js';

/** Every face of one index schema. The server uses only `reader`, `search` and `journals`. */
export interface PostgresIndexStore {
  readonly reader: ArticleReader;
  readonly writer: ArticleWriter;
  readonly search: ArticleSearch;
  readonly journals: JournalDirectory;
  readonly syncState: SyncStateStore;
  /** An article with all its chunks, so a rebuild can reuse embeddings of unchanged articles. */
  findRecord(doi: Doi, signal: AbortSignal): Promise<ArticleRecord | undefined>;
  /**
   * Removes all full text indexed under a licence, in one transaction (ADR 0003). Only a
   * purge build calls it; the live index is never written.
   */
  purgeFullText(licenseUrl: string, signal: AbortSignal): Promise<PurgeCounts>;
}

/** Wraps the index schema `schema`, already created, in the store ports. */
export function createPostgresIndexStore(pool: Pool, schema: string): PostgresIndexStore {
  const s = identifier(schema);

  const findArticles = async (dois: readonly string[], signal: AbortSignal) => {
    const { rows } = await query<{ doi: string; record: string }>(
      pool,
      signal,
      `SELECT doi, record::text AS record FROM ${s}.articles WHERE doi = ANY($1::text[])`,
      [dois],
    );
    const byDoi = new Map(rows.map((row) => [row.doi, articleFromRecord(row.record)]));
    return dois.flatMap((doi) => byDoi.get(doi) ?? []);
  };
  const articleChunks = async (doi: string, signal: AbortSignal) => {
    const { rows } = await query<ChunkRow>(
      pool,
      signal,
      `SELECT ${CHUNK_COLUMNS} FROM ${s}.chunks WHERE doi = $1 ORDER BY ordinal`,
      [doi],
    );
    return rows.map(chunkFromRow);
  };

  return {
    reader: {
      findByDoi: async (doi, signal) => (await findArticles([doi], signal))[0],
      findManyByDoi: findArticles,
      findChunks: async (ids, signal) => {
        const { rows } = await query<ChunkRow>(
          pool,
          signal,
          `SELECT ${CHUNK_COLUMNS} FROM ${s}.chunks WHERE id = ANY($1::text[])`,
          [ids],
        );
        const byId = new Map(rows.map((row) => [row.id, chunkFromRow(row)]));
        return ids.flatMap((id) => byId.get(id) ?? []);
      },
      findArticleChunks: articleChunks,
      indexMeta: async (signal) => {
        signal.throwIfAborted();
        return readIndexMeta(pool, s);
      },
    },
    writer: {
      upsert: (batch, signal) =>
        inTransaction(pool, signal, (client) => putRecords(client, s, batch)),
      remove: (doi, signal) =>
        inTransaction(pool, signal, (client) => removeRecord(client, s, doi)),
      contentHashOf: async (doi, signal) => {
        const { rows } = await query<{ content_hash: string }>(
          pool,
          signal,
          `SELECT content_hash FROM ${s}.articles WHERE doi = $1`,
          [doi],
        );
        return rows[0]?.content_hash;
      },
      writeIndexMeta: async (meta, signal) => {
        signal.throwIfAborted();
        await writeIndexMeta(pool, s, meta);
      },
    },
    search: createPostgresSearch(pool, s),
    journals: createJournalDirectory(pool, s),
    syncState: {
      load: async (source, signal) => {
        const { rows } = await query<{ record: string }>(
          pool,
          signal,
          `SELECT record::text AS record FROM ${s}.sync_state WHERE source = $1`,
          [source],
        );
        const row = rows[0];
        return row === undefined ? undefined : syncStateSchema.parse(fromJsonWithDates(row.record));
      },
      save: async (state, signal) => {
        await query(
          pool,
          signal,
          `INSERT INTO ${s}.sync_state (source, record) VALUES ($1, $2)
           ON CONFLICT (source) DO UPDATE SET record = excluded.record`,
          [state.source, toJsonWithDates(state)],
        );
      },
    },
    findRecord: async (doi, signal) => {
      const article = (await findArticles([doi], signal))[0];
      if (article === undefined) return undefined;
      return { article, chunks: await articleChunks(doi, signal) };
    },
    purgeFullText: (licenseUrl, signal) =>
      inTransaction(pool, signal, (client) => purgeFullText(client, s, licenseUrl)),
  };
}
