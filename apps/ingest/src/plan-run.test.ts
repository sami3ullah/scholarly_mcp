import { describe, expect, it } from 'vitest';
import { planRun } from './plan-run.js';

const now = new Date('2026-11-09T10:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
const live = (lastFullRunAt?: Date) => ({
  currentLayout: true,
  syncState: {
    source: 'crossref',
    lastRunStatus: 'succeeded' as const,
    lastRunAt: now,
    ...(lastFullRunAt && { lastFullRunAt }),
  },
});

describe('planRun', () => {
  it('runs full when asked', () => {
    expect(planRun('full', live(daysAgo(1)), now, 7).kind).toBe('full');
  });

  it('runs incremental when the last full run is recent', () => {
    expect(planRun('incremental', live(daysAgo(6)), now, 7)).toEqual({
      kind: 'incremental',
      reason: 'requested',
    });
  });

  it('turns an incremental request into a full run once a full run is due, so embargoes open', () => {
    expect(planRun('incremental', live(daysAgo(7)), now, 7)).toEqual({
      kind: 'full',
      reason: 'last full run is over 7 days old',
    });
  });

  it('runs full when the index has an older layout', () => {
    expect(planRun('incremental', { ...live(daysAgo(1)), currentLayout: false }, now, 7)).toEqual({
      kind: 'full',
      reason: 'index layout changed',
    });
  });

  it('runs full when there is no index yet or no full run on record', () => {
    expect(planRun('incremental', undefined, now, 7).kind).toBe('full');
    expect(planRun('incremental', live(), now, 7).kind).toBe('full');
  });
});
