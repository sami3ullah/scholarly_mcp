import type { UsageEvent } from '../metering/usage-event.js';

/** Records usage into an outbox. Recording never blocks or fails a request. */
export interface Meter {
  /** Queues an event; duplicates with the same id are dropped downstream. */
  record(event: UsageEvent): void;
  /** Exports queued events, e.g. on SIGTERM. */
  flush(signal: AbortSignal): Promise<void>;
}
