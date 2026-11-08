import { randomBytes } from 'node:crypto';
import type { ArticleRecord, IndexMeta } from '@scholarly-mcp/core';
import { aChunk, anArticle, TEST_EMBEDDING_DIMENSIONS } from '@scholarly-mcp/testkit';
import { createPostgresIndexStore } from '../create-postgres-index-store.js';
import { createIndexSchema } from '../database/index-schema.js';
import { inTransaction, type Pool } from '../database/pool.js';
import { migrateDatabase } from '../database/runtime-schema.js';
import { freshPool } from './fresh-database.js';

export const MODEL = 'multilingual-e5-small@test';

const signal = new AbortController().signal;
let shared: Promise<Pool> | undefined;

/** One migrated database per test file, shared by its tests. */
function migratedPool(): Promise<Pool> {
  shared ??= freshPool().then(async (pool) => {
    await migrateDatabase(pool, signal);
    return pool;
  });
  return shared;
}

/** A store on a new, empty index schema in the file's database. */
export async function freshIndexStore(dimensions = TEST_EMBEDDING_DIMENSIONS) {
  const pool = await migratedPool();
  const schema = `index_t${randomBytes(6).toString('hex')}`;
  await inTransaction(pool, signal, (client) => createIndexSchema(client, schema, { dimensions }));
  return { pool, schema, store: createPostgresIndexStore(pool, schema) };
}

/** A record with a distinct title and embedding per number. */
export function recordNumber(n: number): ArticleRecord {
  const doi = `10.1055/a-${String(n)}`;
  return {
    article: anArticle()
      .withDoi(doi)
      .withTitle(`Study ${String(n)} of anticoagulation`)
      .build(),
    chunks: [aChunk().of(doi).withEmbedding(1, n).build()],
  };
}

export function metaFor(version: string, articleCount: number): IndexMeta {
  return {
    version,
    modelVersion: MODEL,
    articleCount,
    chunkCount: articleCount,
    builtAt: new Date('2026-11-02T10:00:00Z'),
  };
}
