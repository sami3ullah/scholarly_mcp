import type { UsageEvent } from '../metering/usage-event.js';

/**
 * The durable metering outbox (PLAN.md: metering). Events wait here until every exporter
 * has taken them, so an exporter outage loses nothing. Several exporters may share one
 * outbox: each claims a batch for a lease, so none resends another's batch (ADR 0034).
 */
export interface UsageOutbox {
  /** Stores an event; an id already stored is ignored (the id is the idempotency key). */
  append(event: UsageEvent, signal: AbortSignal): Promise<void>;
  /**
   * Claims up to `limit` events not yet exported whose lease has run out by `now`, oldest
   * first, and leases them until `leaseUntil`. No other claim returns them meanwhile.
   */
  claim(limit: number, now: Date, leaseUntil: Date, signal: AbortSignal): Promise<UsageEvent[]>;
  /** Ends the lease of claimed events, so the next claim may take them again. */
  release(ids: readonly string[], signal: AbortSignal): Promise<void>;
  /** Marks events exported, ending any lease; unknown ids are ignored. */
  markExported(ids: readonly string[], at: Date, signal: AbortSignal): Promise<void>;
  /** How many events wait for export, claimed or not. */
  countPending(signal: AbortSignal): Promise<number>;
  /** Deletes events exported before `before`; returns how many. Pending events stay. */
  deleteExported(before: Date, signal: AbortSignal): Promise<number>;
}
