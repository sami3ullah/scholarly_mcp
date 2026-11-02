import type { SyncState } from '@scholarly-mcp/core';
import type { BuildKind } from '@scholarly-mcp/store-sqlite';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The command a person or scheduler asked for. */
export type IngestCommand = 'full' | 'incremental';

/** What the live index says about the last runs, when there is a live index. */
export interface LiveIndex {
  readonly syncState: SyncState | undefined;
}

/** The kind of build to run, and why, for the log. */
export interface RunPlan {
  readonly kind: BuildKind;
  readonly reason: string;
}

/**
 * Decides whether a run is full or incremental. An incremental request becomes a full run
 * when there is no index to build on, or when the last full run is older than
 * `fullRunDays`, so a scheduler only ever needs to call `ingest incremental`.
 */
export function planRun(
  command: IngestCommand,
  live: LiveIndex | undefined,
  now: Date,
  fullRunDays: number,
): RunPlan {
  if (command === 'full') return { kind: 'full', reason: 'requested' };
  if (live === undefined) return { kind: 'full', reason: 'no index yet' };
  const lastFull = live.syncState?.lastFullRunAt;
  if (lastFull === undefined) return { kind: 'full', reason: 'no full run recorded' };
  if (now.getTime() - lastFull.getTime() >= fullRunDays * DAY_MS) {
    return { kind: 'full', reason: `last full run is over ${String(fullRunDays)} days old` };
  }
  return { kind: 'incremental', reason: 'requested' };
}
