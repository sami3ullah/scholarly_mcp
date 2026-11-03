import { appError, isAppError, type IndexMeta, type IndexReader } from '@scholarly-mcp/core';
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
  refresh: () => Promise<boolean> = () => Promise.resolve(false),
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
      return Promise.resolve();
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
      if (!available) {
        return Promise.reject(appError('INDEX_UNAVAILABLE', 'No index file at /data/index.sqlite'));
      }
      return Promise.resolve(fakeReader('v1'));
    }, createTestLogger(logs));

    await live.refresh();
    const error: unknown = await live.reader.indexMeta(signal).catch((caught: unknown) => caught);
    expect(isAppError(error) && error.code).toBe('INDEX_UNAVAILABLE');
    expect(isAppError(error) && error.message).not.toContain('/data');
    expect(live.isReady()).toBe(false);

    available = true;
    await live.refresh();
    expect(live.isReady()).toBe(true);
    expect(live.version()).toBe('v1');
    expect(await live.journals.journals(signal)).toEqual([]);
    expect(logs.at(-1)).toMatchObject({ message: 'Index opened', fields: { version: 'v1' } });
  });

  it('logs the same problem once, not on every refresh', async () => {
    const live = createLiveIndex(
      () => Promise.reject(new Error('missing')),
      createTestLogger(logs),
    );
    await live.refresh();
    await live.refresh();
    await live.refresh();
    expect(logs.filter(({ message }) => message === 'Index not available')).toHaveLength(1);
  });

  it('logs a swapped-in build and keeps the index when the new one is refused', async () => {
    let next: () => Promise<boolean> = () => Promise.resolve(true);
    const reader = fakeReader('v2', () => next());
    const live = createLiveIndex(() => Promise.resolve(reader), createTestLogger(logs));
    await live.refresh();
    await live.refresh();
    expect(logs.at(-1)).toMatchObject({ message: 'Index swapped in' });

    next = () => Promise.reject(appError('INDEX_UNAVAILABLE', 'model mismatch'));
    await live.refresh();
    expect(live.isReady()).toBe(true);
    expect(logs.at(-1)).toMatchObject({ level: 'warn', fields: { reason: 'model mismatch' } });
  });

  it('runs one refresh at a time; a call meanwhile waits for the running one', async () => {
    let opens = 0;
    let release: (() => void) | undefined;
    const live = createLiveIndex(() => {
      opens += 1;
      return new Promise<IndexReader>((resolve) => {
        release = () => {
          resolve(fakeReader('v1'));
        };
      });
    }, createTestLogger(logs));
    const first = live.refresh();
    const second = live.refresh();
    release?.();
    await Promise.all([first, second]);
    expect(opens).toBe(1);
    expect(live.isReady()).toBe(true);
  });

  it('gives up an open that takes longer than the timeout, until the next tick', async () => {
    const live = createLiveIndex(
      (openSignal) =>
        new Promise<IndexReader>((_, reject) => {
          openSignal.addEventListener('abort', () => {
            reject(openSignal.reason as Error);
          });
        }),
      createTestLogger(logs),
      { timeoutMs: 10 },
    );
    await live.refresh();
    expect(live.isReady()).toBe(false);
    expect(logs.at(-1)).toMatchObject({ message: 'Index not available' });
  });

  it('closes the open index, and one that finishes opening after close', async () => {
    const reader = fakeReader('v1');
    const live = createLiveIndex(() => Promise.resolve(reader), createTestLogger(logs));
    await live.refresh();
    await live.close();
    expect(reader.closed).toBe(true);
    expect(live.isReady()).toBe(false);

    const late = fakeReader('v2');
    let release: (() => void) | undefined;
    const slow = createLiveIndex(
      () =>
        new Promise<IndexReader>((resolve) => {
          release = () => {
            resolve(late);
          };
        }),
      createTestLogger(logs),
    );
    const refreshing = slow.refresh();
    const closing = slow.close();
    release?.();
    await Promise.all([refreshing, closing]);
    expect(late.closed).toBe(true);
    expect(slow.isReady()).toBe(false);
  });
});
