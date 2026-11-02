import { describe, expect, it } from 'vitest';
import { INCREMENTAL_OVERLAP_MS, incrementalWindow } from './incremental-window.js';
import type { SyncState } from './sync-state.js';

const now = new Date('2026-11-02T10:00:00Z');
const windowFrom = new Date('2026-10-31T06:00:00Z');
const windowUntil = new Date('2026-11-01T06:00:00Z');

function state(changes: Partial<SyncState>): SyncState {
  return { source: 'crossref', lastRunStatus: 'succeeded', lastRunAt: now, ...changes };
}

describe('incrementalWindow', () => {
  it('starts one day before the last successful window ended, to absorb clock skew', () => {
    expect(incrementalWindow(state({ windowFrom, windowUntil }), now)).toEqual({
      updatedSince: new Date(windowUntil.getTime() - INCREMENTAL_OVERLAP_MS),
      until: now,
    });
  });

  it.each(['failed', 'running'] as const)(
    'retries from the start of a %s run so nothing it missed is skipped',
    (lastRunStatus) => {
      expect(incrementalWindow(state({ lastRunStatus, windowFrom, windowUntil }), now)).toEqual({
        updatedSince: windowFrom,
        until: now,
      });
    },
  );

  it('is a full run when there is no previous run', () => {
    expect(incrementalWindow(undefined, now)).toEqual({ until: now });
  });

  it('is a full run again when the previous full run did not succeed', () => {
    expect(incrementalWindow(state({ lastRunStatus: 'failed', windowUntil }), now)).toEqual({
      until: now,
    });
  });
});
