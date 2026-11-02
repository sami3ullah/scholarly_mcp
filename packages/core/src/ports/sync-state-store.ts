import type { SyncState } from '../sync/sync-state.js';

/** Persists ingestion checkpoints, one per source. */
export interface SyncStateStore {
  load(source: string, signal: AbortSignal): Promise<SyncState | undefined>;
  save(state: SyncState, signal: AbortSignal): Promise<void>;
}
