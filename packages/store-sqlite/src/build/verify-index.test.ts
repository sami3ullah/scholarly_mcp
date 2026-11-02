import { aChunk, anArticle, TEST_EMBEDDING_DIMENSIONS } from '@scholarly-mcp/testkit';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSqliteIndexStore, type SqliteIndexStore } from '../create-sqlite-index-store.js';
import { createIndexSchema } from '../database/index-schema.js';
import { openDatabase, type Db } from '../database/open-database.js';
import { MODEL, recordNumber } from '../testing/index-files.js';
import { verifyIndex } from './verify-index.js';

const signal = new AbortController().signal;

describe('verifyIndex', () => {
  let db: Db;
  let store: SqliteIndexStore;

  beforeEach(async () => {
    db = openDatabase(':memory:');
    createIndexSchema(db, { dimensions: TEST_EMBEDDING_DIMENSIONS });
    store = createSqliteIndexStore(db);
    await store.writer.upsert([1, 2, 3, 4, 5, 6].map(recordNumber), signal);
  });

  const failed = async (options: Parameters<typeof verifyIndex>[1] = { modelVersion: MODEL }) => {
    const report = await verifyIndex(db, options, signal);
    return report.checks.filter((check) => !check.ok).map((check) => check.name);
  };

  it('passes a sound index and reports its counts and sample queries', async () => {
    const report = await verifyIndex(db, { modelVersion: MODEL, samples: 3 }, signal);
    expect(report).toMatchObject({ ok: true, articleCount: 6, chunkCount: 6 });
    expect(report.checks.filter((check) => check.name.startsWith('title finds'))).toHaveLength(3);
  });

  it('fails an empty index', async () => {
    const empty = openDatabase(':memory:');
    createIndexSchema(empty, { dimensions: TEST_EMBEDDING_DIMENSIONS });
    const report = await verifyIndex(empty, { modelVersion: MODEL }, signal);
    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.name === 'not empty')?.ok).toBe(false);
  });

  it('fails when chunks were embedded by another model', async () => {
    expect(await failed({ modelVersion: 'bge-m3@1' })).toEqual(['one model version']);
  });

  it('fails when the index shrank more than allowed', async () => {
    expect(await failed({ modelVersion: MODEL, minArticleCount: 10 })).toEqual([
      'no unexpected shrink',
    ]);
  });

  it('fails when an article has no chunks', async () => {
    await store.writer.upsert(
      [{ article: anArticle().withDoi('10.1055/a-lonely').build(), chunks: [] }],
      signal,
    );
    expect(await failed()).toContain('every article has chunks');
  });

  it('fails when a chunk has lost its vector', async () => {
    db.prepare('DELETE FROM vec_chunks WHERE rowid = 1').run();
    expect(await failed()).toContain('vector per chunk');
  });

  it('fails a sample whose chunk cannot be found by its own vector', async () => {
    await store.writer.upsert(
      [{ ...recordNumber(1), chunks: [aChunk().of('10.1055/a-1').withEmbedding(0).build()] }],
      signal,
    );
    expect(await failed()).toContain('vector finds 10.1055/a-1#0');
  });
});
