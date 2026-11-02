import type { Clock } from '@scholarly-mcp/core';

/** A clock that only moves when told to. */
export interface FakeClock extends Clock {
  advance(ms: number): void;
}

/** Creates a clock frozen at `start`. */
export function createFakeClock(start = new Date('2026-11-02T10:00:00Z')): FakeClock {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    advance: (ms) => {
      current += ms;
    },
  };
}
