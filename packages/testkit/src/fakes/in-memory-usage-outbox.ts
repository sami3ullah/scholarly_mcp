import type { UsageEvent, UsageOutbox } from '@scholarly-mcp/core';
import { settle } from './settle.js';

/** An in-memory outbox that also exposes every stored event for assertions. */
export interface InMemoryUsageOutbox extends UsageOutbox {
  all(): UsageEvent[];
}

/** Creates an empty in-memory metering outbox. */
export function createInMemoryUsageOutbox(): InMemoryUsageOutbox {
  const events = new Map<string, UsageEvent>();
  const ordered = () =>
    [...events.values()].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  return {
    append: (event, signal) =>
      settle(signal, () => {
        if (!events.has(event.id)) events.set(event.id, event);
      }),
    pending: (limit, signal) =>
      settle(signal, () =>
        ordered()
          .filter((event) => event.exportedAt === undefined)
          .slice(0, limit),
      ),
    markExported: (ids, at, signal) =>
      settle(signal, () => {
        for (const id of ids) {
          const event = events.get(id);
          if (event !== undefined) events.set(id, { ...event, exportedAt: at });
        }
      }),
    countPending: (signal) =>
      settle(signal, () => ordered().filter((event) => event.exportedAt === undefined).length),
    deleteExported: (before, signal) =>
      settle(signal, () => {
        const old = ordered().filter(
          (event) => event.exportedAt !== undefined && event.exportedAt < before,
        );
        for (const event of old) events.delete(event.id);
        return old.length;
      }),
    all: ordered,
  };
}
