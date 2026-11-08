import type { UsageEvent, UsageEventQuery, UsageOutbox } from '@scholarly-mcp/core';
import { settle } from './settle.js';

/** An in-memory outbox that also exposes every stored event for assertions. */
export interface InMemoryUsageOutbox extends UsageOutbox {
  all(): UsageEvent[];
}

/** Creates an empty in-memory metering outbox. */
export function createInMemoryUsageOutbox(): InMemoryUsageOutbox {
  const events = new Map<string, UsageEvent>();
  const leases = new Map<string, Date>();
  const ordered = () =>
    [...events.values()].sort(
      (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || compare(a.id, b.id),
    );
  const pending = () => ordered().filter((event) => event.exportedAt === undefined);
  return {
    append: (event, signal) =>
      settle(signal, () => {
        if (!events.has(event.id)) events.set(event.id, event);
      }),
    claim: (limit, now, leaseUntil, signal) =>
      settle(signal, () => {
        const free = pending().filter((event) => (leases.get(event.id) ?? now) <= now);
        const claimed = free.slice(0, Math.max(0, limit));
        for (const { id } of claimed) leases.set(id, leaseUntil);
        return claimed;
      }),
    release: (ids, signal) =>
      settle(signal, () => {
        for (const id of ids) leases.delete(id);
      }),
    markExported: (ids, at, signal) =>
      settle(signal, () => {
        for (const id of ids) {
          const event = events.get(id);
          if (event === undefined) continue;
          events.set(id, { ...event, exportedAt: at });
          leases.delete(id);
        }
      }),
    countPending: (signal) => settle(signal, () => pending().length),
    deleteExported: (before, signal) =>
      settle(signal, () => {
        const old = ordered().filter(
          (event) => event.exportedAt !== undefined && event.exportedAt < before,
        );
        for (const event of old) events.delete(event.id);
        return old.length;
      }),
    list: (query, signal) =>
      settle(signal, () =>
        ordered()
          .filter((event) => listed(query, event))
          .slice(0, Math.max(0, query.limit)),
      ),
    all: ordered,
  };
}

function listed(query: UsageEventQuery, event: UsageEvent): boolean {
  const at = event.occurredAt.getTime();
  if (query.from !== undefined && at < query.from.getTime()) return false;
  if (query.to !== undefined && at >= query.to.getTime()) return false;
  const { after } = query;
  if (after === undefined) return true;
  const since = after.occurredAt.getTime();
  return at > since || (at === since && compare(event.id, after.id) > 0);
}

/** Byte order, as the stores sort ids. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
