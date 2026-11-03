import type { UsageEvent, UsageOutbox } from '@scholarly-mcp/core';
import { beforeEach, describe, expect, it } from 'vitest';

const signal = new AbortController().signal;

function anEvent(id: string, minute: number, extra: Partial<UsageEvent> = {}): UsageEvent {
  return {
    id,
    apiKeyId: 'key_aaaaaaaaaaaa',
    tool: 'search_articles',
    resultCount: 5,
    latencyMs: 12.5,
    status: 'ok',
    billable: true,
    occurredAt: new Date(Date.UTC(2026, 10, 3, 10, minute)),
    ...extra,
  };
}

/** The behaviour every metering outbox must share. */
export function runUsageOutboxContract(
  name: string,
  create: () => UsageOutbox | Promise<UsageOutbox>,
): void {
  describe(`${name} satisfies the usage outbox contract`, () => {
    let outbox: UsageOutbox;
    beforeEach(async () => {
      outbox = await create();
    });

    it('returns pending events oldest first, unchanged, up to the limit', async () => {
      const failed = anEvent('e2', 1, { status: 'RATE_LIMITED', billable: false, resultCount: 0 });
      await outbox.append(anEvent('e3', 2), signal);
      await outbox.append(failed, signal);
      await outbox.append(anEvent('e1', 0), signal);
      expect(await outbox.pending(2, signal)).toEqual([anEvent('e1', 0), failed]);
      expect(await outbox.countPending(signal)).toBe(3);
    });

    it('ignores an event whose id is already stored', async () => {
      await outbox.append(anEvent('e1', 0), signal);
      await outbox.append(anEvent('e1', 5, { resultCount: 9 }), signal);
      expect(await outbox.pending(10, signal)).toEqual([anEvent('e1', 0)]);
    });

    it('stops returning exported events and keeps the id taken', async () => {
      const at = new Date('2026-11-03T11:00:00Z');
      await outbox.append(anEvent('e1', 0), signal);
      await outbox.append(anEvent('e2', 1), signal);
      await outbox.markExported(['e1', 'unknown'], at, signal);
      expect(await outbox.pending(10, signal)).toEqual([anEvent('e2', 1)]);
      await outbox.append(anEvent('e1', 0), signal);
      expect(await outbox.countPending(signal)).toBe(1);
    });

    it('deletes only events exported before the cutoff', async () => {
      await outbox.append(anEvent('old', 0), signal);
      await outbox.append(anEvent('recent', 1), signal);
      await outbox.append(anEvent('pending', 2), signal);
      await outbox.markExported(['old'], new Date('2026-10-01T00:00:00Z'), signal);
      await outbox.markExported(['recent'], new Date('2026-11-03T00:00:00Z'), signal);
      expect(await outbox.deleteExported(new Date('2026-10-15T00:00:00Z'), signal)).toBe(1);
      expect(await outbox.countPending(signal)).toBe(1);
      expect(await outbox.deleteExported(new Date('2026-12-01T00:00:00Z'), signal)).toBe(1);
      expect(await outbox.pending(10, signal)).toEqual([anEvent('pending', 2)]);
    });

    it('rejects when the caller has already aborted', async () => {
      await expect(outbox.append(anEvent('e1', 0), AbortSignal.abort())).rejects.toThrow();
    });
  });
}
