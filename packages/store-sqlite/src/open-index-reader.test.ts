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

  const codeOf = (work: () => unknown) => {
    try {
      work();
    } catch (error) {
      return isAppError(error) ? error.code : 'not an AppError';
    }
    return undefined;
  };

  it('reports a missing index file as unavailable', () => {
    expect(codeOf(() => openIndexReader(indexPath, MODEL))).toBe('INDEX_UNAVAILABLE');
  });

  it('refuses an index built with another embedding model', async () => {
    await build('v1', 'bge-m3@1', 1);
    expect(codeOf(() => openIndexReader(indexPath, MODEL))).toBe('INDEX_UNAVAILABLE');
  });

  it('follows a swapped-in index on refresh, and only when the version changed', async () => {
    await build('v1', MODEL, 1);
    const reader = openIndexReader(indexPath, MODEL);
    expect(reader.refresh()).toBe(false);

    await build('v2', MODEL, 1, 2);
    expect(await reader.reader.findByDoi(recordNumber(2).article.doi, signal)).toBeUndefined();
    expect(reader.refresh()).toBe(true);
    expect(reader.meta().version).toBe('v2');
    expect(await reader.reader.findByDoi(recordNumber(2).article.doi, signal)).toBeDefined();
    reader.close();
  });

  it('keeps serving the current index when the new one is unusable', async () => {
    await build('v1', MODEL, 1);
    const reader = openIndexReader(indexPath, MODEL);
    await build('v2', 'bge-m3@1', 1);
    expect(codeOf(() => reader.refresh())).toBe('INDEX_UNAVAILABLE');
    expect(reader.meta().version).toBe('v1');
    expect(await reader.reader.findByDoi(recordNumber(1).article.doi, signal)).toBeDefined();
    reader.close();
  });
});
