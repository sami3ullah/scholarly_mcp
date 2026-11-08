import { describe, expect, it } from 'vitest';
import { doiSchema } from '../article/doi.js';
import { computeFunnel } from './funnel.js';
import type { LandingAction, UsageEvent } from './usage-event.js';

const at = (day: number, hour = 10) => new Date(Date.UTC(2026, 10, day, hour));
let next = 0;

function call(
  tool: 'search_articles' | 'find_related' | 'cite',
  cards: Record<string, number>,
  extra: { day?: number; status?: 'ok' | 'TIMEOUT'; id?: string } = {},
): UsageEvent {
  const ok = (extra.status ?? 'ok') === 'ok';
  return {
    kind: 'tool_call',
    id: extra.id ?? `c${String((next += 1))}`,
    tool,
    resultCount: ok ? Object.values(cards).reduce((a, b) => a + b, 0) : 0,
    latencyMs: 10,
    status: extra.status ?? 'ok',
    billable: ok,
    cardsByJournal: ok
      ? Object.entries(cards).map(([journal, count]) => ({ journal, cards: count }))
      : [],
    occurredAt: at(extra.day ?? 3),
  };
}

function visit(journal: string, extra: { day?: number; id?: string } = {}) {
  return {
    kind: 'landing_visit',
    id: extra.id ?? `v${String((next += 1))}`,
    tool: 'search_articles',
    doi: doiSchema.parse('10.1055/a-1'),
    journal,
    billable: false,
    occurredAt: at(extra.day ?? 3, 11),
  } satisfies UsageEvent;
}

function action(journal: string, kind: LandingAction): UsageEvent {
  return { ...visit(journal), kind: 'landing_action', action: kind };
}

describe('computeFunnel', () => {
  const events: UsageEvent[] = [
    call('search_articles', { Thrombosis: 3, Pneumologie: 2 }),
    call('search_articles', { Thrombosis: 1 }, { day: 4 }),
    call('find_related', { Pneumologie: 4 }),
    call('cite', {}),
    call('search_articles', {}, { status: 'TIMEOUT' }),
    visit('Thrombosis'),
    visit('Thrombosis', { day: 4 }),
    visit('Pneumologie'),
    action('Thrombosis', 'read'),
    action('Pneumologie', 'buy'),
    action('Pneumologie', 'buy'),
  ];

  it('counts the four steps', () => {
    const funnel = computeFunnel(events);
    expect(funnel.totals).toEqual({
      searches: 2,
      cardsShown: 10,
      visits: 3,
      actions: 3,
      clickThrough: 0.3,
    });
    expect(funnel.events).toBe(events.length);
  });

  it('breaks cards, visits and actions down per journal, most cards first', () => {
    expect(computeFunnel(events).byJournal).toEqual([
      { journal: 'Pneumologie', cardsShown: 6, visits: 1, actions: 2, clickThrough: 1 / 6 },
      { journal: 'Thrombosis', cardsShown: 4, visits: 2, actions: 1, clickThrough: 0.5 },
    ]);
  });

  it('counts failed calls apart, without cards or a search', () => {
    const search = computeFunnel(events).byTool.find((row) => row.tool === 'search_articles');
    expect(search).toEqual({
      tool: 'search_articles',
      calls: 2,
      failedCalls: 1,
      cardsShown: 6,
      visits: 3,
    });
  });

  it('lists every action, zeros included, most clicked first', () => {
    expect(computeFunnel(events).byAction).toEqual([
      { action: 'buy', count: 2 },
      { action: 'read', count: 1 },
      { action: 'sign_in', count: 0 },
      { action: 'view_on_publisher', count: 0 },
      { action: 'check_access', count: 0 },
    ]);
  });

  it('groups by UTC day, oldest first', () => {
    const days = computeFunnel(events).byDay.map(({ day, searches, visits }) => [
      day,
      searches,
      visits,
    ]);
    expect(days).toEqual([
      ['2026-11-03', 1, 2],
      ['2026-11-04', 1, 1],
    ]);
  });

  it('counts an event delivered twice once', () => {
    const twice = [...events, ...events.slice(0, 3)];
    const funnel = computeFunnel(twice);
    expect(funnel.totals.cardsShown).toBe(10);
    expect(funnel.duplicates).toBe(3);
  });

  it('filters by period', () => {
    const funnel = computeFunnel(events, { from: at(4, 0), to: at(5, 0) });
    expect(funnel.totals).toMatchObject({ searches: 1, cardsShown: 1, visits: 1 });
    expect(funnel.period).toEqual({ first: at(4), last: at(4, 11) });
  });

  it('has no period and no click-through without events', () => {
    const funnel = computeFunnel([]);
    expect(funnel.period).toBeUndefined();
    expect(funnel.totals.clickThrough).toBeUndefined();
    expect(funnel.byJournal).toEqual([]);
  });
});
