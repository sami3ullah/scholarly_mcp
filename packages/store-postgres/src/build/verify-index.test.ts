import { anArticle } from '@scholarly-mcp/testkit';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PostgresIndexStore } from '../create-postgres-index-store.js';
import type { Pool } from '../database/pool.js';
import { MODEL, freshIndexStore, recordNumber } from '../testing/index-schemas.js';
import { verifyPostgresIndex, type PostgresVerifyOptions } from './verify-index.js';

const signal = new AbortController().signal;

describe('verifyPostgresIndex', () => {
  let pool: Pool;
  let schema: string;
  let store: PostgresIndexStore;

  beforeEach(async () => {
    ({ pool, schema, store } = await freshIndexStore());
    await store.writer.upsert([1, 2, 3, 4, 5, 6].map(recordNumber), signal);
  });

  const failed = async (options: PostgresVerifyOptions = { modelVersion: MODEL }) => {
    const report = await verifyPostgresIndex(pool, schema, options, signal);
    return report.checks.filter((check) => !check.ok).map((check) => check.name);
  };

  it('passes a sound index and reports its counts and sample queries', async () => {
    const report = await verifyPostgresIndex(
      pool,
      schema,
      { modelVersion: MODEL, samples: 3 },
      signal,
    );
    expect(report).toMatchObject({ ok: true, articleCount: 6, chunkCount: 6 });
    expect(report.checks.filter((check) => check.name.startsWith('title finds'))).toHaveLength(3);
  });

  it('fails an empty index', async () => {
    const empty = await freshIndexStore();
    const report = await verifyPostgresIndex(pool, empty.schema, { modelVersion: MODEL }, signal);
    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.name === 'not empty')?.ok).toBe(false);
  });

  it('fails a schema of another layout without looking further', async () => {
    await pool.query(`UPDATE "${schema}".layout SET version = 0`);
    expect(await failed()).toEqual(['index layout']);
  });

  it('fails when a search index is missing', async () => {
    await pool.query(`DROP INDEX "${schema}".chunks_trigram`);
    expect(await failed()).toEqual(['search indexes']);
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
});
