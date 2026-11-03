import type { UsageEvent } from '../metering/usage-event.js';

/** Which stored events `list` returns, a page at a time. */
export interface UsageEventQuery {
  /** Inclusive. */
  readonly from?: Date;
  /** Exclusive. */
  readonly to?: Date;
  readonly apiKeyId?: string;
  /** The last event of the previous page; this page starts after it. */
  readonly after?: { readonly occurredAt: Date; readonly id: string };
  readonly limit: number;
}

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
  /**
   * Up to `limit` stored events, exported or not, in `(occurredAt, id)` order with ids in
   * byte order, for read-only views such as the live funnel (ADR 0035). Leases are neither
   * taken nor honoured. Exported events are only here until `deleteExported` removes them.
   */
  list(query: UsageEventQuery, signal: AbortSignal): Promise<UsageEvent[]>;
}
