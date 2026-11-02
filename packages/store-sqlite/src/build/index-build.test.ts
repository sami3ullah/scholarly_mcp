import { existsSync } from 'node:fs';
import { isAppError } from '@scholarly-mcp/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
    const build = beginIndexBuild({ indexPath, kind: 'full', now });
    await build.store.writer.upsert(numbers.map(recordNumber), signal);
    build.commit(metaFor(version, numbers.length));
  }

  it('builds next to the live index and swaps it in on commit', async () => {
    const build = beginIndexBuild({ indexPath, kind: 'full', now });
    await build.store.writer.upsert([recordNumber(1)], signal);
    expect(existsSync(indexPath)).toBe(false);
    build.commit(metaFor('v1', 1));
    expect(existsSync(buildPathOf(indexPath))).toBe(false);
    const reader = openIndexReader(indexPath, MODEL);
    expect(reader.meta().version).toBe('v1');
    expect(await reader.reader.findByDoi(recordNumber(1).article.doi, signal)).toBeDefined();
    reader.close();
  });

  it('commits a single file with no write-ahead log beside it', async () => {
    await buildFull('v1', 1);
    expect(existsSync(`${indexPath}-wal`)).toBe(false);
    expect(
      openDatabase(indexPath, { readonly: true }).pragma('journal_mode', { simple: true }),
    ).toBe('delete');
  });

  it('resumes an interrupted build of the same kind with its rows and checkpoint', async () => {
    const first = beginIndexBuild({ indexPath, kind: 'full', now });
    await first.store.writer.upsert([recordNumber(1)], signal);
    await first.store.syncState.save(
      { source: 'crossref', cursor: 'page-2', lastRunStatus: 'running', lastRunAt: now },
      signal,
    );
    first.close();

    const again = beginIndexBuild({ indexPath, kind: 'full', now });
    expect(again.resumed).toBe(true);
    expect((await again.store.syncState.load('crossref', signal))?.cursor).toBe('page-2');
    expect(
      await again.store.writer.contentHashOf(recordNumber(1).article.doi, signal),
    ).toBeDefined();
    again.close();
  });

  it('discards a leftover build of the other kind', async () => {
    await buildFull('v1', 1);
    const incremental = beginIndexBuild({ indexPath, kind: 'incremental', now });
    await incremental.store.writer.upsert([recordNumber(2)], signal);
    incremental.close();

    const full = beginIndexBuild({ indexPath, kind: 'full', now });
    expect(full.resumed).toBe(false);
    expect(
      await full.store.writer.contentHashOf(recordNumber(1).article.doi, signal),
    ).toBeUndefined();
    full.close();
  });

  it('starts an incremental build from a copy of the live index', async () => {
    await buildFull('v1', 1);
    const build = beginIndexBuild({ indexPath, kind: 'incremental', now });
    expect(
      await build.store.writer.contentHashOf(recordNumber(1).article.doi, signal),
    ).toBeDefined();
    await build.store.writer.upsert([recordNumber(2)], signal);
    build.commit(metaFor('v2', 2));
    const reader = openIndexReader(indexPath, MODEL);
    expect(reader.meta()).toMatchObject({ version: 'v2', articleCount: 2 });
    reader.close();
  });

  it('deletes a discarded build, so the next run starts over', async () => {
    const build = beginIndexBuild({ indexPath, kind: 'full', now });
    await build.store.writer.upsert([recordNumber(1)], signal);
    build.discard();
    expect(existsSync(buildPathOf(indexPath))).toBe(false);
    expect(beginIndexBuild({ indexPath, kind: 'full', now }).resumed).toBe(false);
  });

  it('refuses an incremental build when there is no live index', () => {
    let error: unknown;
    try {
      beginIndexBuild({ indexPath, kind: 'incremental', now });
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
    expect(() => beginIndexBuild({ indexPath, kind: 'incremental', now })).toThrow(/older layout/);
  });
});
