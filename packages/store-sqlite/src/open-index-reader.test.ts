import { isAppError } from '@scholarly-mcp/core';
import { TEST_EMBEDDING_DIMENSIONS } from '@scholarly-mcp/testkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { beginIndexBuild } from './build/index-build.js';
import { openIndexReader } from './open-index-reader.js';
import { MODEL, metaFor, recordNumber, tempIndexPath } from './testing/index-files.js';

const signal = new AbortController().signal;
const now = new Date('2026-11-02T10:00:00Z');

describe('openIndexReader', () => {
  let indexPath: string;
  let cleanup: () => void;

  beforeEach(() => {
    ({ indexPath, cleanup } = tempIndexPath());
  });
  afterEach(() => {
    cleanup();
  });

  async function build(version: string, modelVersion = MODEL, ...numbers: number[]) {
    const next = beginIndexBuild({
      indexPath,
      kind: 'full',
      now,
      dimensions: TEST_EMBEDDING_DIMENSIONS,
    });
    await next.store.writer.upsert(numbers.map(recordNumber), signal);
    next.commit({ ...metaFor(version, numbers.length), modelVersion });
  }

  const codeOf = (work: () => Promise<unknown>) =>
    work().then(
      () => undefined,
      (error: unknown) => (isAppError(error) ? error.code : 'not an AppError'),
    );

  it('reports a missing index file as unavailable', async () => {
    expect(await codeOf(() => openIndexReader(indexPath, MODEL, signal))).toBe('INDEX_UNAVAILABLE');
  });

  it('refuses an index built with another embedding model', async () => {
    await build('v1', 'bge-m3@1', 1);
    expect(await codeOf(() => openIndexReader(indexPath, MODEL, signal))).toBe('INDEX_UNAVAILABLE');
  });

  it('follows a swapped-in index on refresh, and only when the version changed', async () => {
    await build('v1', MODEL, 1);
    const reader = await openIndexReader(indexPath, MODEL, signal);
    expect(await reader.refresh(signal)).toBe(false);

    await build('v2', MODEL, 1, 2);
    expect(await reader.reader.findByDoi(recordNumber(2).article.doi, signal)).toBeUndefined();
    expect(await reader.refresh(signal)).toBe(true);
    expect(reader.meta().version).toBe('v2');
    expect(await reader.reader.findByDoi(recordNumber(2).article.doi, signal)).toBeDefined();
    await reader.close();
  });

  it('keeps serving the current index when the new one is unusable', async () => {
    await build('v1', MODEL, 1);
    const reader = await openIndexReader(indexPath, MODEL, signal);
    await build('v2', 'bge-m3@1', 1);
    expect(await codeOf(() => reader.refresh(signal))).toBe('INDEX_UNAVAILABLE');
    expect(reader.meta().version).toBe('v1');
    expect(await reader.reader.findByDoi(recordNumber(1).article.doi, signal)).toBeDefined();
    await reader.close();
  });

  describe('with search workers', () => {
    const query = { terms: ['anticoagulation'], filters: {}, limit: 10 };

    it('searches on the workers and moves them to a swapped-in index on refresh', async () => {
      await build('v1', MODEL, 1);
      const reader = await openIndexReader(indexPath, MODEL, signal, { searchWorkers: 2 });
      const searches = () =>
        Promise.all([1, 2, 3, 4].map(() => reader.search.lexical(query, signal)));
      expect((await searches()).map((hits) => hits.length)).toEqual([1, 1, 1, 1]);

      await build('v2', MODEL, 1, 2);
      expect(await reader.refresh(signal)).toBe(true);
      expect((await searches()).map((hits) => hits.length)).toEqual([2, 2, 2, 2]);
      const embedding = recordNumber(2).chunks[0]?.embedding ?? new Float32Array();
      const [nearest] = await reader.search.vector({ embedding, filters: {}, limit: 1 }, signal);
      expect(nearest?.doi).toBe(recordNumber(2).article.doi);
      await reader.close();
    });

    it('drops a search aborted while it waits for a worker', async () => {
      await build('v1', MODEL, 1);
      const reader = await openIndexReader(indexPath, MODEL, signal, { searchWorkers: 1 });
      const running = reader.search.lexical(query, signal);
      const controller = new AbortController();
      const waiting = reader.search.lexical(query, controller.signal);
      controller.abort(new Error('budget spent'));
      await expect(waiting).rejects.toThrow('budget spent');
      expect(await running).toHaveLength(1);
      await reader.close();
    });

    it('refuses searches once closed', async () => {
      await build('v1', MODEL, 1);
      const reader = await openIndexReader(indexPath, MODEL, signal, { searchWorkers: 1 });
      await reader.close();
      await expect(reader.search.lexical(query, signal)).rejects.toThrow('closed');
    });
  });
});
