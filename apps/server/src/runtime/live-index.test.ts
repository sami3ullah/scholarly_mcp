import { appError, isAppError, type IndexMeta } from '@scholarly-mcp/core';
import type { IndexReader } from '@scholarly-mcp/store-sqlite';
import {
  createInMemoryArticleStore,
  createTestLogger,
  type CapturedLine,
} from '@scholarly-mcp/testkit';
import { beforeEach, describe, expect, it } from 'vitest';
import { createLiveIndex } from './live-index.js';

const signal = new AbortController().signal;
const meta = (version: string): IndexMeta => ({
  version,
  modelVersion: 'm',
  articleCount: 1,
  chunkCount: 1,
  builtAt: new Date('2026-11-02T10:00:00Z'),
});

/** A fake reader whose `refresh` reports what the test scripts. */
function fakeReader(
  version: string,
  refresh: () => boolean = () => false,
): IndexReader & { closed: boolean } {
  const store = createInMemoryArticleStore();
  const reader = {
    reader: store,
    search: store,
    journals: store,
    meta: () => meta(version),
    refresh,
    closed: false,
    close() {
      reader.closed = true;
    },
  };
  return reader;
}

describe('createLiveIndex', () => {
  let logs: CapturedLine[];
  beforeEach(() => {
    logs = [];
  });

  it('answers INDEX_UNAVAILABLE until an index can be opened, then serves it', async () => {
    let available = false;
    const live = createLiveIndex(() => {
      if (!available) throw appError('INDEX_UNAVAILABLE', 'No index file at /data/index.sqlite');
      return fakeReader('v1');
    }, createTestLogger(logs));

    live.refresh();
    const error: unknown = await live.reader.indexMeta(signal).catch((caught: unknown) => caught);
    expect(isAppError(error) && error.code).toBe('INDEX_UNAVAILABLE');
    expect(isAppError(error) && error.message).not.toContain('/data');
    expect(live.isReady()).toBe(false);

    available = true;
    live.refresh();
    expect(live.isReady()).toBe(true);
    expect(live.version()).toBe('v1');
    expect(await live.journals.journals(signal)).toEqual([]);
    expect(logs.at(-1)).toMatchObject({ message: 'Index opened', fields: { version: 'v1' } });
  });

  it('logs the same problem once, not on every refresh', () => {
    const live = createLiveIndex(() => {
      throw new Error('missing');
    }, createTestLogger(logs));
    live.refresh();
    live.refresh();
    live.refresh();
    expect(logs.filter(({ message }) => message === 'Index not available')).toHaveLength(1);
  });

  it('logs a swapped-in build and keeps the index when the new file is refused', () => {
    let next: () => boolean = () => true;
    const reader = fakeReader('v2', () => next());
    const live = createLiveIndex(() => reader, createTestLogger(logs));
    live.refresh();
    live.refresh();
    expect(logs.at(-1)).toMatchObject({ message: 'Index swapped in' });

    next = () => {
      throw appError('INDEX_UNAVAILABLE', 'model mismatch');
    };
    live.refresh();
    expect(live.isReady()).toBe(true);
    expect(logs.at(-1)).toMatchObject({ level: 'warn', fields: { reason: 'model mismatch' } });
  });

  it('closes the open index', () => {
    const reader = fakeReader('v1');
    const live = createLiveIndex(() => reader, createTestLogger(logs));
    live.refresh();
    live.close();
    expect(reader.closed).toBe(true);
    expect(live.isReady()).toBe(false);
  });
});
