import type { UsageEventQuery, UsageOutbox } from '../ports/usage-outbox.js';
import type { UsageEvent } from './usage-event.js';

/** Events per `list` call: small enough for one round trip, large enough to be few. */
const PAGE_SIZE = 1000;

/**
 * Every stored event that `filters` covers, oldest first, read a page at a time, so a
 * month of events never sits in memory at once (ADR 0035).
 */
export async function* readUsageEvents(
  outbox: Pick<UsageOutbox, 'list'>,
  filters: Omit<UsageEventQuery, 'after' | 'limit'>,
  signal: AbortSignal,
  pageSize = PAGE_SIZE,
): AsyncGenerator<UsageEvent> {
  let after: UsageEventQuery['after'];
  for (;;) {
    const page = await outbox.list(
      { ...filters, ...(after !== undefined && { after }), limit: pageSize },
      signal,
    );
    yield* page;
    const last = page.at(-1);
    if (last === undefined || page.length < pageSize) return;
    after = { occurredAt: last.occurredAt, id: last.id };
  }
}
