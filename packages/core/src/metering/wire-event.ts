import { usageEventSchema, type UsageEvent } from './usage-event.js';

/** An event as exporters write it: plain JSON, ISO timestamps, no `exportedAt`. */
export type WireEvent = ReturnType<typeof toWireEvent>;

/**
 * The export format (ADR 0033): every line carries `kind`; tool calls keep the fields they had
 * before referral events (ADR 0031). `exportedAt` is outbox bookkeeping and never leaves the
 * server.
 */
export function toWireEvent(event: UsageEvent) {
  const copy = { ...event };
  delete copy.exportedAt;
  return { ...copy, occurredAt: event.occurredAt.toISOString() };
}

/**
 * Reads one exported event back, e.g. a line of the JSON lines file. Lines written before
 * ADR 0033 have no `kind`; they are tool calls without card counts.
 */
export function parseWireEvent(value: unknown): UsageEvent {
  const raw = typeof value === 'object' && value !== null ? value : {};
  const legacy = !('kind' in raw);
  return usageEventSchema.parse({
    ...(legacy && { kind: 'tool_call', cardsByJournal: [] }),
    ...raw,
    occurredAt: 'occurredAt' in raw ? new Date(String(raw.occurredAt)) : undefined,
  });
}
