import { isAppError } from '@scholarly-mcp/core';
import { TEST_EMBEDDING_DIMENSIONS } from '@scholarly-mcp/testkit';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPostgresIndexStore } from '../create-postgres-index-store.js';
import type { Pool } from '../database/pool.js';
import { migrateDatabase } from '../database/runtime-schema.js';
import { freshPool } from '../testing/fresh-database.js';
import { metaFor, recordNumber } from '../testing/index-schemas.js';
import { beginPostgresIndexBuild, type BuildKind } from './index-build.js';
import { readLiveIndex } from './live-index.js';

const signal = new AbortController().signal;
const now = new Date('2026-11-02T10:00:00Z');

describe('Postgres index builds', () => {
  let pool: Pool;

  beforeEach(async () => {
    pool = await freshPool();
    await migrateDatabase(pool, signal);
  });

  const begin = (kind: BuildKind, dimensions = TEST_EMBEDDING_DIMENSIONS) =>
    beginPostgresIndexBuild({ pool, kind, now, dimensions }, signal);

  async function buildFull(version: string, ...numbers: number[]) {
    const build = await begin('full');
    await build.store.writer.upsert(numbers.map(recordNumber), signal);
    await build.commit(metaFor(version, numbers.length), signal);
    return build.schema;
  }

  const schemas = async () =>
    (
      await pool.query<{ name: string }>(
        "SELECT nspname AS name FROM pg_namespace WHERE nspname LIKE 'index\\_%' ORDER BY 1",
      )
    ).rows.map(({ name }) => name);

  it('builds in its own schema and points the live index at it on commit', async () => {
    const build = await begin('full');
    await build.store.writer.upsert([recordNumber(1)], signal);
    expect(await readLiveIndex(pool)).toBeUndefined();
    await build.commit(metaFor('v1', 1), signal);

    const live = await readLiveIndex(pool);
    expect(live).toEqual({ schema: build.schema, version: 'v1' });
    const store = createPostgresIndexStore(pool, build.schema);
    expect(await store.reader.indexMeta(signal)).toEqual(metaFor('v1', 1));
    expect(await store.reader.findByDoi(recordNumber(1).article.doi, signal)).toBeDefined();
    expect(
      (await pool.query('SELECT 1 FROM scholarly.index_build')).rowCount,
      'no build in progress',
    ).toBe(0);
  });

  it('keeps the previous index for running queries and drops the one before it', async () => {
    const first = await buildFull('v1', 1);
    const second = await buildFull('v2', 1, 2);
    expect(await readLiveIndex(pool)).toEqual({
      schema: second,
      version: 'v2',
      previousSchema: first,
    });
    const third = await buildFull('v3', 1, 2, 3);
    expect(await schemas()).toEqual([second, third].sort());
  });

  it('resumes an interrupted build of the same kind with its rows and checkpoint', async () => {
    const first = await begin('full');
    await first.store.writer.upsert([recordNumber(1)], signal);
    await first.store.syncState.save(
      { source: 'crossref', cursor: 'page-2', lastRunStatus: 'running', lastRunAt: now },
      signal,
    );

    const again = await begin('full');
    expect(again).toMatchObject({ resumed: true, schema: first.schema });
    expect((await again.store.syncState.load('crossref', signal))?.cursor).toBe('page-2');
    expect(
      await again.store.writer.contentHashOf(recordNumber(1).article.doi, signal),
    ).toBeDefined();
  });

  it('drops a leftover build of the other kind', async () => {
    const live = await buildFull('v1', 1);
    const incremental = await begin('incremental');
    await incremental.store.writer.upsert([recordNumber(2)], signal);

    const full = await begin('full');
    expect(full.resumed).toBe(false);
    expect(
      await full.store.writer.contentHashOf(recordNumber(1).article.doi, signal),
    ).toBeUndefined();
    expect(await schemas()).toEqual([live, full.schema].sort());
  });

  it.each<BuildKind>(['incremental', 'purge'])(
    'starts a %s build from a copy of the live index',
    async (kind) => {
      const live = await buildFull('v1', 1);
      const build = await begin(kind);
      expect(build.resumed).toBe(false);
      expect(build.schema).not.toBe(live);
      expect(await build.store.findRecord(recordNumber(1).article.doi, signal)).toEqual(
        recordNumber(1),
      );
      await build.store.writer.upsert([recordNumber(2)], signal);
      const hits = await build.store.search.lexical(
        { terms: ['anticoagulation'], filters: {}, limit: 10 },
        signal,
      );
      expect(hits).toHaveLength(2);
      await build.commit(metaFor('v2', 2), signal);
      const store = createPostgresIndexStore(pool, build.schema);
      expect(await store.reader.indexMeta(signal)).toMatchObject({
        version: 'v2',
        articleCount: 2,
      });
      // The live index was never written.
      const before = createPostgresIndexStore(pool, live);
      expect(await before.writer.contentHashOf(recordNumber(2).article.doi, signal)).toBe(
        undefined,
      );
    },
  );

  it('drops a discarded build, so the next run starts over', async () => {
    const build = await begin('full');
    await build.store.writer.upsert([recordNumber(1)], signal);
    await build.discard(signal);
    expect(await schemas()).toEqual([]);
    expect((await begin('full')).resumed).toBe(false);
  });

  it('refuses an incremental build when there is no live index', async () => {
    const error: unknown = await begin('incremental').catch((caught: unknown) => caught);
    expect(isAppError(error) && error.code).toBe('INDEX_UNAVAILABLE');
    expect(await schemas()).toEqual([]);
  });

  it('refuses an incremental build on an index with an older layout', async () => {
    const live = await buildFull('v1', 1);
    await pool.query(`UPDATE "${live}".layout SET version = 0`);
    await expect(begin('incremental')).rejects.toThrow(/older layout/);
  });

  it('starts over instead of resuming a leftover build for another vector size', async () => {
    const first = await begin('full');
    await first.store.writer.upsert([recordNumber(1)], signal);
    const other = await begin('full', 1024);
    expect(other.resumed).toBe(false);
    expect(await schemas()).toEqual([other.schema]);
  });

  it('refuses an incremental build on an index of another vector size', async () => {
    await buildFull('v1', 1);
    await expect(begin('incremental', 1024)).rejects.toThrow(/another size/);
  });

  it('grants the server role read access to a committed build only', async () => {
    await pool.query('CREATE ROLE scholarly_server_test NOLOGIN');
    try {
      const build = await beginPostgresIndexBuild(
        {
          pool,
          kind: 'full',
          now,
          dimensions: TEST_EMBEDDING_DIMENSIONS,
          serverRole: 'scholarly_server_test',
        },
        signal,
      );
      await build.store.writer.upsert([recordNumber(1)], signal);
      const canRead = async () =>
        (
          await pool.query<{ ok: boolean }>(
            "SELECT has_table_privilege('scholarly_server_test', $1, 'SELECT') AS ok",
            [`"${build.schema}".chunks`],
          )
        ).rows[0]?.ok;
      expect(await canRead()).toBe(false);
      await build.commit(metaFor('v1', 1), signal);
      expect(await canRead()).toBe(true);
      const { rows } = await pool.query<{ ok: boolean }>(
        "SELECT has_table_privilege('scholarly_server_test', $1, 'INSERT') AS ok",
        [`"${build.schema}".chunks`],
      );
      expect(rows[0]?.ok).toBe(false);
    } finally {
      await pool.query('DROP OWNED BY scholarly_server_test');
      await pool.query('DROP ROLE scholarly_server_test');
    }
  });
});
