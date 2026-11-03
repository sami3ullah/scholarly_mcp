import { describe, expect, it } from 'vitest';
import { usageEventSchema } from './usage-event.js';

const ok = {
  id: 'req-1',
  apiKeyId: 'key_demo',
  tool: 'search_articles',
  resultCount: 5,
  latencyMs: 120,
  status: 'ok',
  billable: true,
  occurredAt: new Date('2026-11-02T10:00:00Z'),
};

describe('usageEventSchema', () => {
  it('accepts a successful billable call', () => {
    expect(usageEventSchema.safeParse(ok).success).toBe(true);
  });

  it('accepts a failed call that is not billable', () => {
    const event = { ...ok, status: 'TIMEOUT', billable: false, resultCount: 0 };
    expect(usageEventSchema.safeParse(event).success).toBe(true);
  });

  it('rejects a failed call marked billable', () => {
    const result = usageEventSchema.safeParse({ ...ok, status: 'RATE_LIMITED' });
    expect(result.error?.issues[0]?.message).toBe('Failed calls are not billable');
  });

  it('has no field for query text', () => {
    const parsed = usageEventSchema.parse({ ...ok, query: 'patient with chest pain' });
    expect(parsed).not.toHaveProperty('query');
  });
});

describe('usage status', () => {
  it('accepts INTERNAL for an unexpected failure, not billable', () => {
    const event = { ...ok, status: 'INTERNAL', billable: false };
    expect(usageEventSchema.safeParse(event).success).toBe(true);
  });
});
