import {
  doiSchema,
  type ToolCallEvent,
  type UsageEvent,
  type UsageOutbox,
} from '@scholarly-mcp/core';
import { beforeEach, describe, expect, it } from 'vitest';

const signal = new AbortController().signal;
const NOW = new Date('2026-11-03T12:00:00Z');
const LEASE_MS = 60_000;

function anEvent(id: string, minute: number, extra: Partial<ToolCallEvent> = {}): UsageEvent {
  return {
    kind: 'tool_call',
    id,
    apiKeyId: 'key_aaaaaaaaaaaa',
    tool: 'search_articles',
    resultCount: 5,
    latencyMs: 12.5,
    status: 'ok',
    billable: true,
    cardsByJournal: [{ journal: 'Pneumologie', cards: 5 }],
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
    /** Claims at a fixed time with a one-minute lease, like one exporter pass. */
    const claim = (limit: number, now = NOW) =>
      outbox.claim(limit, now, new Date(now.getTime() + LEASE_MS), signal);
    beforeEach(async () => {
      outbox = await create();
    });

    it('returns pending events oldest first, unchanged, up to the limit', async () => {
      const failed = anEvent('e2', 1, { status: 'RATE_LIMITED', billable: false, resultCount: 0 });
      await outbox.append(anEvent('e3', 2), signal);
      await outbox.append(failed, signal);
      await outbox.append(anEvent('e1', 0), signal);
      expect(await claim(2)).toEqual([anEvent('e1', 0), failed]);
      expect(await outbox.countPending(signal)).toBe(3);
    });

    it('returns landing visits and actions unchanged', async () => {
      const visit: UsageEvent = {
        kind: 'landing_visit',
        id: 'v1',
        apiKeyId: 'key_aaaaaaaaaaaa',
        tool: 'find_related',
        doi: doiSchema.parse('10.1055/a-1'),
        journal: 'Pneumologie',
        billable: false,
        occurredAt: new Date(Date.UTC(2026, 10, 3, 10, 1)),
      };
      const action: UsageEvent = { ...visit, kind: 'landing_action', id: 'a1', action: 'buy' };
      delete action.tool;
      await outbox.append(anEvent('e1', 0, { cardsByJournal: [] }), signal);
      await outbox.append(visit, signal);
      await outbox.append(
        { ...action, occurredAt: new Date(Date.UTC(2026, 10, 3, 10, 2)) },
        signal,
      );
      expect(await claim(10)).toEqual([
        anEvent('e1', 0, { cardsByJournal: [] }),
        visit,
        { ...action, occurredAt: new Date(Date.UTC(2026, 10, 3, 10, 2)) },
      ]);
    });

    it('ignores an event whose id is already stored', async () => {
      await outbox.append(anEvent('e1', 0), signal);
      await outbox.append(anEvent('e1', 5, { resultCount: 9 }), signal);
      expect(await claim(10)).toEqual([anEvent('e1', 0)]);
    });

    it('stops returning exported events and keeps the id taken', async () => {
      const at = new Date('2026-11-03T11:00:00Z');
      await outbox.append(anEvent('e1', 0), signal);
      await outbox.append(anEvent('e2', 1), signal);
      await outbox.markExported(['e1', 'unknown'], at, signal);
      expect(await claim(10)).toEqual([anEvent('e2', 1)]);
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
      expect(await claim(10)).toEqual([anEvent('pending', 2)]);
    });

    it('does not hand a claimed event to a second claim until its lease runs out', async () => {
      await outbox.append(anEvent('e1', 0), signal);
      await outbox.append(anEvent('e2', 1), signal);
      expect((await claim(1)).map(({ id }) => id)).toEqual(['e1']);
      expect((await claim(10)).map(({ id }) => id)).toEqual(['e2']);
      expect(await claim(10)).toEqual([]);
      expect(await outbox.countPending(signal)).toBe(2);
      const later = new Date(NOW.getTime() + LEASE_MS);
      expect((await claim(10, later)).map(({ id }) => id)).toEqual(['e1', 'e2']);
    });

    it('lets a released event be claimed again at once', async () => {
      await outbox.append(anEvent('e1', 0), signal);
      await claim(10);
      await outbox.release(['e1', 'unknown'], signal);
      expect((await claim(10)).map(({ id }) => id)).toEqual(['e1']);
    });

    it('never gives the same event to claims made at the same time', async () => {
      for (let minute = 0; minute < 20; minute += 1) {
        await outbox.append(anEvent(`e${String(minute).padStart(2, '0')}`, minute), signal);
      }
      const batches = await Promise.all([claim(8), claim(8), claim(8)]);
      const ids = batches.flat().map(({ id }) => id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toHaveLength(20);
    });

    it('ends the lease when an event is exported', async () => {
      await outbox.append(anEvent('e1', 0), signal);
      await claim(10);
      await outbox.markExported(['e1'], NOW, signal);
      expect(await claim(10, new Date(NOW.getTime() + LEASE_MS))).toEqual([]);
      expect(await outbox.countPending(signal)).toBe(0);
    });

    it('rejects when the caller has already aborted', async () => {
      await expect(outbox.append(anEvent('e1', 0), AbortSignal.abort())).rejects.toThrow();
    });
  });
}
