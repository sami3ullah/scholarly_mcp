import { describe, expect, it } from 'vitest';
import { usageEventSchema } from './usage-event.js';
import { parseWireEvent, toWireEvent } from './wire-event.js';

const ok = {
  kind: 'tool_call',
  id: 'req-1',
  tool: 'search_articles',
  resultCount: 5,
  latencyMs: 120,
  status: 'ok',
  billable: true,
  cardsByJournal: [{ journal: 'Thrombosis and Haemostasis', cards: 5 }],
  occurredAt: new Date('2026-11-02T10:00:00Z'),
};

const visit = {
  kind: 'landing_visit',
  id: 'v-1',
  tool: 'search_articles',
  doi: '10.1055/a-1',
  journal: 'Thrombosis and Haemostasis',
  billable: false,
  occurredAt: new Date('2026-11-02T10:05:00Z'),
};

describe('usageEventSchema', () => {
  it('accepts a successful billable call', () => {
    expect(usageEventSchema.safeParse(ok).success).toBe(true);
  });

  it('accepts a failed call that is not billable', () => {
    const event = { ...ok, status: 'TIMEOUT', billable: false, resultCount: 0, cardsByJournal: [] };
    expect(usageEventSchema.safeParse(event).success).toBe(true);
  });

  it('rejects a failed call marked billable', () => {
    const result = usageEventSchema.safeParse({ ...ok, status: 'RATE_LIMITED' });
    expect(result.error?.issues[0]?.message).toBe('Failed calls are not billable');
  });

  it('accepts INTERNAL for an unexpected failure, not billable', () => {
    const event = { ...ok, status: 'INTERNAL', billable: false };
    expect(usageEventSchema.safeParse(event).success).toBe(true);
  });

  it('has no field for query text or a landing token', () => {
    const parsed = usageEventSchema.parse({ ...ok, query: 'chest pain' });
    expect(parsed).not.toHaveProperty('query');
    expect(usageEventSchema.parse({ ...visit, t: 'AAAA' })).not.toHaveProperty('t');
  });

  it('never bills a landing visit or action', () => {
    expect(usageEventSchema.safeParse({ ...visit, billable: true }).success).toBe(false);
    const action = { ...visit, kind: 'landing_action', action: 'buy' };
    expect(usageEventSchema.safeParse(action).success).toBe(true);
    expect(usageEventSchema.safeParse({ ...action, action: 'subscribe' }).success).toBe(false);
  });

  it('accepts a visit without a known tool', () => {
    const withoutTool: Partial<typeof visit> = { ...visit };
    delete withoutTool.tool;
    expect(usageEventSchema.safeParse(withoutTool).success).toBe(true);
  });
});

describe('wire events', () => {
  it('round-trips every kind through JSON', () => {
    for (const event of [ok, visit, { ...visit, kind: 'landing_action', action: 'read' }]) {
      const parsed = usageEventSchema.parse(event);
      const line = JSON.stringify(toWireEvent(parsed));
      expect(parseWireEvent(JSON.parse(line))).toEqual(parsed);
    }
  });

  it('leaves exportedAt out and writes ISO timestamps', () => {
    const parsed = usageEventSchema.parse({ ...ok, exportedAt: new Date() });
    const wire = toWireEvent(parsed);
    expect(wire).not.toHaveProperty('exportedAt');
    expect(wire.occurredAt).toBe('2026-11-02T10:00:00.000Z');
  });

  it('reads a line written before referral events as a tool call', () => {
    const legacy: Partial<typeof ok> = { ...ok };
    delete legacy.kind;
    delete legacy.cardsByJournal;
    const event = parseWireEvent({ ...legacy, occurredAt: '2026-11-02T10:00:00.000Z' });
    expect(event).toMatchObject({ kind: 'tool_call', cardsByJournal: [] });
  });

  it('rejects a line that is not an event', () => {
    expect(() => parseWireEvent({ hello: 'world' })).toThrow();
    expect(() => parseWireEvent('nope')).toThrow();
  });
});
