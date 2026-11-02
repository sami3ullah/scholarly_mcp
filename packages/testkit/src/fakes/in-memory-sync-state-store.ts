import type { SyncState, SyncStateStore } from '@scholarly-mcp/core';
import { settle } from './settle.js';

/** Creates an empty in-memory checkpoint store. */
export function createInMemorySyncStateStore(): SyncStateStore {
  const states = new Map<string, SyncState>();
  return {
    load: (source, signal) => settle(signal, () => states.get(source)),
    save: (state, signal) =>
      settle(signal, () => {
        states.set(state.source, state);
      }),
  };
}
