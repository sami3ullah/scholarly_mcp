import type { SyncState } from './sync-state.js';

/** How far back an incremental run reaches before the last window's end (PLAN.md edge cases). */
export const INCREMENTAL_OVERLAP_MS = 24 * 60 * 60 * 1000;

/** The time window an ingestion run covers. `updatedSince` absent means a full run. */
export interface SyncWindow {
  readonly updatedSince?: Date;
  readonly until: Date;
}

/**
 * Chooses the window for the next incremental run, ending at `now`.
 *
 * After a successful run it starts one day before that run's window ended, to absorb clock
 * skew and records the source made visible late; re-fetched records are cheap because
 * unchanged content hashes skip re-embedding. After a failed or interrupted run it starts
 * where that run started, so nothing it missed is skipped. With no window to build on, it is
 * a full run.
 */
export function incrementalWindow(previous: SyncState | undefined, now: Date): SyncWindow {
  if (previous?.lastRunStatus === 'succeeded' && previous.windowUntil !== undefined) {
    const since = previous.windowUntil.getTime() - INCREMENTAL_OVERLAP_MS;
    return { updatedSince: new Date(since), until: now };
  }
  const retryFrom = previous?.windowFrom;
  return retryFrom === undefined ? { until: now } : { updatedSince: retryFrom, until: now };
}
