import type { JournalDirectory, JournalSummary } from '@scholarly-mcp/core';
import { describe, expect, it } from 'vitest';
import { createJournalCatalog } from './journal-catalog.js';

const signal = new AbortController().signal;

function countingDirectory(results: (() => Promise<JournalSummary[]>)[]) {
  let calls = 0;
  const directory: JournalDirectory = {
    journals: () => {
      const next = results[Math.min(calls, results.length - 1)] ?? (() => Promise.resolve([]));
      calls += 1;
      return next();
    },
  };
  return { directory, calls: () => calls };
}

describe('createJournalCatalog', () => {
  it('loads the journals once per index version', async () => {
    let version = 'v1';
    const { directory, calls } = countingDirectory([() => Promise.resolve([])]);
    const catalog = createJournalCatalog(directory, () => version);
    await Promise.all([catalog.list(signal), catalog.list(signal)]);
    expect(calls()).toBe(1);
    version = 'v2';
    await catalog.list(signal);
    expect(calls()).toBe(2);
  });

  it('does not cache a failed load', async () => {
    const { directory, calls } = countingDirectory([
      () => Promise.reject(new Error('busy')),
      () => Promise.resolve([]),
    ]);
    const catalog = createJournalCatalog(directory, () => 'v1');
    await expect(catalog.list(signal)).rejects.toThrow('busy');
    await expect(catalog.list(signal)).resolves.toEqual([]);
    expect(calls()).toBe(2);
  });

  it('passes through without caching while no index is open', async () => {
    const { directory, calls } = countingDirectory([() => Promise.resolve([])]);
    const catalog = createJournalCatalog(directory, () => undefined);
    await catalog.list(signal);
    await catalog.list(signal);
    expect(calls()).toBe(2);
  });
});
