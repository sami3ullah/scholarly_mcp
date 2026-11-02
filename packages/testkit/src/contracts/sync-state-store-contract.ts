import type { SyncState, SyncStateStore } from '@scholarly-mcp/core';
import { beforeEach, describe, expect, it } from 'vitest';

const signal = new AbortController().signal;

const state = (source: string, cursor: string): SyncState => ({
  source,
  cursor,
  windowFrom: new Date('2024-01-01T00:00:00Z'),
  lastRunStatus: 'running',
  lastRunAt: new Date('2026-11-02T10:00:00Z'),
});

/** The behaviour every ingestion checkpoint store must share. */
export function runSyncStateStoreContract(
  name: string,
  create: () => SyncStateStore | Promise<SyncStateStore>,
): void {
  describe(`${name} satisfies the sync state store contract`, () => {
    let store: SyncStateStore;
    beforeEach(async () => {
      store = await create();
    });

    it('returns undefined for a source that never ran', async () => {
      expect(await store.load('crossref', signal)).toBeUndefined();
    });

    it('returns the latest checkpoint per source', async () => {
      await store.save(state('crossref', 'c1'), signal);
      await store.save(state('crossref', 'c2'), signal);
      await store.save(state('europepmc', 'e1'), signal);
      expect(await store.load('crossref', signal)).toEqual(state('crossref', 'c2'));
      expect(await store.load('europepmc', signal)).toEqual(state('europepmc', 'e1'));
    });

    it('rejects when the caller has already aborted', async () => {
      await expect(store.load('crossref', AbortSignal.abort())).rejects.toThrow();
    });
  });
}
