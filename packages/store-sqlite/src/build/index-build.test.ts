import { existsSync } from 'node:fs';
import { isAppError } from '@scholarly-mcp/core';
import { TEST_EMBEDDING_DIMENSIONS } from '@scholarly-mcp/testkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { embeddingDimensionsOf } from '../database/index-schema.js';
import { openDatabase } from '../database/open-database.js';
import { openIndexReader } from '../open-index-reader.js';
import { MODEL, metaFor, recordNumber, tempIndexPath } from '../testing/index-files.js';
import { beginIndexBuild, buildPathOf } from './index-build.js';

const signal = new AbortController().signal;
const now = new Date('2026-11-02T10:00:00Z');

describe('index builds', () => {
  let indexPath: string;
  let cleanup: () => void;

  beforeEach(() => {
    ({ indexPath, cleanup } = tempIndexPath());
  });
  afterEach(() => {
    cleanup();
  });

  async function buildFull(version: string, ...numbers: number[]) {
    const build = beginIndexBuild({
      indexPath,
      kind: 'full',
      now,
      dimensions: TEST_EMBEDDING_DIMENSIONS,
    });
    await build.store.writer.upsert(numbers.map(recordNumber), signal);
    build.commit(metaFor(version, numbers.length));
  }

  it('builds next to the live index and swaps it in on commit', async () => {
    const build = beginIndexBuild({
      indexPath,
      kind: 'full',
      now,
      dimensions: TEST_EMBEDDING_DIMENSIONS,
    });
    await build.store.writer.upsert([recordNumber(1)], signal);
    expect(existsSync(indexPath)).toBe(false);
    build.commit(metaFor('v1', 1));
    expect(existsSync(buildPathOf(indexPath))).toBe(false);
    const reader = await openIndexReader(indexPath, MODEL, signal);
    expect(reader.meta().version).toBe('v1');
    expect(await reader.reader.findByDoi(recordNumber(1).article.doi, signal)).toBeDefined();
    await reader.close();
  });

  it('commits a single file with no write-ahead log beside it', async () => {
    await buildFull('v1', 1);
    expect(existsSync(`${indexPath}-wal`)).toBe(false);
    expect(
      openDatabase(indexPath, { readonly: true }).pragma('journal_mode', { simple: true }),
    ).toBe('delete');
  });

  it('resumes an interrupted build of the same kind with its rows and checkpoint', async () => {
    const first = beginIndexBuild({
      indexPath,
      kind: 'full',
      now,
      dimensions: TEST_EMBEDDING_DIMENSIONS,
    });
    await first.store.writer.upsert([recordNumber(1)], signal);
    await first.store.syncState.save(
      { source: 'crossref', cursor: 'page-2', lastRunStatus: 'running', lastRunAt: now },
      signal,
    );
    first.close();

    const again = beginIndexBuild({
      indexPath,
      kind: 'full',
      now,
      dimensions: TEST_EMBEDDING_DIMENSIONS,
    });
    expect(again.resumed).toBe(true);
    expect((await again.store.syncState.load('crossref', signal))?.cursor).toBe('page-2');
    expect(
      await again.store.writer.contentHashOf(recordNumber(1).article.doi, signal),
    ).toBeDefined();
    again.close();
  });

  it('discards a leftover build of the other kind', async () => {
    await buildFull('v1', 1);
    const incremental = beginIndexBuild({
      indexPath,
      kind: 'incremental',
      now,
      dimensions: TEST_EMBEDDING_DIMENSIONS,
    });
    await incremental.store.writer.upsert([recordNumber(2)], signal);
    incremental.close();

    const full = beginIndexBuild({
      indexPath,
      kind: 'full',
      now,
      dimensions: TEST_EMBEDDING_DIMENSIONS,
    });
    expect(full.resumed).toBe(false);
    expect(
      await full.store.writer.contentHashOf(recordNumber(1).article.doi, signal),
    ).toBeUndefined();
    full.close();
  });

  it('starts an incremental build from a copy of the live index', async () => {
    await buildFull('v1', 1);
    const build = beginIndexBuild({
      indexPath,
      kind: 'incremental',
      now,
      dimensions: TEST_EMBEDDING_DIMENSIONS,
    });
    expect(
      await build.store.writer.contentHashOf(recordNumber(1).article.doi, signal),
    ).toBeDefined();
    await build.store.writer.upsert([recordNumber(2)], signal);
    build.commit(metaFor('v2', 2));
    const reader = await openIndexReader(indexPath, MODEL, signal);
    expect(reader.meta()).toMatchObject({ version: 'v2', articleCount: 2 });
    await reader.close();
  });

  it('adds the language index to a live index that lacks it on the next build', async () => {
    await buildFull('v1', 1);
    const live = openDatabase(indexPath);
    live.exec('DROP INDEX vec_chunks_by_language');
    live.close();
    const build = beginIndexBuild({
      indexPath,
      kind: 'incremental',
      now,
      dimensions: TEST_EMBEDDING_DIMENSIONS,
    });
    build.commit(metaFor('v2', 1));
    const db = openDatabase(indexPath, { readonly: true });
    const plan = db
      .prepare<[], { detail: string }>(
        "EXPLAIN QUERY PLAN SELECT rowid FROM vec_chunks WHERE language = 'de'",
      )
      .all();
    db.close();
    expect(plan.map(({ detail }) => detail).join(' ')).toContain('vec_chunks_by_language');
  });

  it('starts a purge build from a copy of the live index too', async () => {
    await buildFull('v1', 1);
    const build = beginIndexBuild({
      indexPath,
      kind: 'purge',
      now,
      dimensions: TEST_EMBEDDING_DIMENSIONS,
    });
    expect(build.resumed).toBe(false);
    expect(
      await build.store.writer.contentHashOf(recordNumber(1).article.doi, signal),
    ).toBeDefined();
    build.close();
  });

  it('deletes a discarded build, so the next run starts over', async () => {
    const build = beginIndexBuild({
      indexPath,
      kind: 'full',
      now,
      dimensions: TEST_EMBEDDING_DIMENSIONS,
    });
    await build.store.writer.upsert([recordNumber(1)], signal);
    build.discard();
    expect(existsSync(buildPathOf(indexPath))).toBe(false);
    expect(
      beginIndexBuild({ indexPath, kind: 'full', now, dimensions: TEST_EMBEDDING_DIMENSIONS })
        .resumed,
    ).toBe(false);
  });

  it('refuses an incremental build when there is no live index', () => {
    let error: unknown;
    try {
      beginIndexBuild({
        indexPath,
        kind: 'incremental',
        now,
        dimensions: TEST_EMBEDDING_DIMENSIONS,
      });
    } catch (caught) {
      error = caught;
    }
    expect(isAppError(error) && error.code).toBe('INDEX_UNAVAILABLE');
  });

  it('refuses an incremental build on an index with an older layout', async () => {
    await buildFull('v1', 1);
    const db = openDatabase(indexPath);
    db.pragma('user_version = 0');
    db.close();
    expect(() =>
      beginIndexBuild({
        indexPath,
        kind: 'incremental',
        now,
        dimensions: TEST_EMBEDDING_DIMENSIONS,
      }),
    ).toThrow(/older layout/);
  });
  it('starts over instead of resuming a leftover build for another vector size', async () => {
    const first = beginIndexBuild({
      indexPath,
      kind: 'full',
      now,
      dimensions: TEST_EMBEDDING_DIMENSIONS,
    });
    await first.store.writer.upsert([recordNumber(1)], signal);
    first.close();
    const other = beginIndexBuild({ indexPath, kind: 'full', now, dimensions: 1024 });
    expect(other.resumed).toBe(false);
    expect(embeddingDimensionsOf(other.db)).toBe(1024);
    other.close();
  });

  it('refuses an incremental build on an index of another vector size', async () => {
    await buildFull('v1', 1);
    expect(() =>
      beginIndexBuild({ indexPath, kind: 'incremental', now, dimensions: 1024 }),
    ).toThrow(/another size/);
  });
});
