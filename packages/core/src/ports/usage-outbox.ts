import type { UsageEvent } from '../metering/usage-event.js';

/**
 * The durable metering outbox (PLAN.md: metering). Events wait here until every exporter
 * has taken them, so an exporter outage loses nothing.
 */
export interface UsageOutbox {
  /** Stores an event; an id already stored is ignored (the id is the idempotency key). */
  append(event: UsageEvent, signal: AbortSignal): Promise<void>;
  /** Up to `limit` events not yet exported, oldest first. */
  pending(limit: number, signal: AbortSignal): Promise<UsageEvent[]>;
  /** Marks events exported; unknown ids are ignored. */
  markExported(ids: readonly string[], at: Date, signal: AbortSignal): Promise<void>;
  /** How many events wait for export. */
  countPending(signal: AbortSignal): Promise<number>;
  /** Deletes events exported before `before`; returns how many. Pending events stay. */
  deleteExported(before: Date, signal: AbortSignal): Promise<number>;
}
