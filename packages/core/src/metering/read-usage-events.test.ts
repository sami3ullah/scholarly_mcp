import { describe, expect, it } from 'vitest';
import type { UsageEventQuery } from '../ports/usage-outbox.js';
import { readUsageEvents } from './read-usage-events.js';
import type { UsageEvent } from './usage-event.js';

const signal = new AbortController().signal;

function anEvent(id: string, minute: number): UsageEvent {
  return {
    kind: 'tool_call',
    id,
    tool: 'cite',
    resultCount: 1,
    latencyMs: 1,
    status: 'ok',
    billable: true,
    cardsByJournal: [],
    occurredAt: new Date(Date.UTC(2026, 10, 3, 10, minute)),
  };
}

/** Lists like a store: by time then id, after the cursor, up to the limit. */
function listing(events: readonly UsageEvent[]) {
  const queries: UsageEventQuery[] = [];
  return {
    queries,
    list: (query: UsageEventQuery) => {
      queries.push(query);
      const after = query.after;
      return Promise.resolve(
        events
          .filter(
            (event) =>
              after === undefined ||
              event.occurredAt > after.occurredAt ||
              (event.occurredAt.getTime() === after.occurredAt.getTime() && event.id > after.id),
          )
          .slice(0, query.limit),
      );
    },
  };
}

async function collect(source: AsyncIterable<UsageEvent>): Promise<string[]> {
  const ids: string[] = [];
  for await (const event of source) ids.push(event.id);
  return ids;
}

describe('readUsageEvents', () => {
  it('reads every event once, a page at a time, passing the filters on', async () => {
    const events = [anEvent('a', 0), anEvent('b', 0), anEvent('c', 1), anEvent('d', 2)];
    const outbox = listing(events);
    const from = new Date(Date.UTC(2026, 10, 3));
    expect(await collect(readUsageEvents(outbox, { from }, signal, 2))).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(outbox.queries).toEqual([
      { from, limit: 2 },
      { from, after: { occurredAt: events[1]?.occurredAt, id: 'b' }, limit: 2 },
      { from, after: { occurredAt: events[3]?.occurredAt, id: 'd' }, limit: 2 },
    ]);
  });

  it('stops after a short page', async () => {
    const outbox = listing([anEvent('a', 0)]);
    expect(await collect(readUsageEvents(outbox, {}, signal, 2))).toEqual(['a']);
    expect(outbox.queries).toHaveLength(1);
  });
});
