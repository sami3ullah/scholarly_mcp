import type { Funnel, UsageEvent, UsageEventQuery } from '@scholarly-mcp/core';
import { createInMemoryUsageOutbox, createTestLogger } from '@scholarly-mcp/testkit';
import { describe, expect, it } from 'vitest';
import { createFunnelView, type FunnelViewDeps } from './create-funnel-view.js';

const signal = new AbortController().signal;

function aSearch(id: string, day: string): UsageEvent {
  return {
    kind: 'tool_call',
    id,
    tool: 'search_articles',
    resultCount: 2,
    latencyMs: 5,
    status: 'ok',
    billable: true,
    cardsByJournal: [{ journal: 'Pneumologie', cards: 2 }],
    occurredAt: new Date(`${day}T10:00:00Z`),
  };
}

async function aView(events: UsageEvent[], overrides: Partial<FunnelViewDeps> = {}) {
  const outbox = createInMemoryUsageOutbox();
  for (const event of events) await outbox.append(event, signal);
  const lists: UsageEventQuery[] = [];
  let now = new Date('2026-11-03T12:00:00Z');
  const view = createFunnelView({
    outbox: {
      list: (query, listSignal) => {
        lists.push(query);
        return outbox.list(query, listSignal);
      },
    },
    publisher: 'Example Publisher',
    clock: { now: () => now },
    logger: createTestLogger(),
    source: 'Postgres scholarly.usage_events (exported events kept 30 days)',
    refreshSeconds: 60,
    filters: {},
    ...overrides,
  });
  return {
    outbox,
    lists,
    later: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
    get: (path: string, method = 'GET') =>
      view.fetch(new Request(`http://127.0.0.1:8092${path}`, { method })),
  };
}

describe('live funnel view', () => {
  it('renders the events in the store now, reloading itself', async () => {
    const view = await aView([aSearch('e1', '2026-11-02'), aSearch('e2', '2026-11-03')]);
    const response = await view.get('/');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    const html = await response.text();
    expect(html).toContain('<meta http-equiv="refresh" content="60">');
    expect(html).toContain('Postgres scholarly.usage_events (exported events kept 30 days)');
    expect(html).toContain('Pneumologie');
    expect(html).not.toMatch(/<script/);
  });

  it('gives the same numbers as JSON, filtered by the query string', async () => {
    const view = await aView([
      aSearch('e1', '2026-11-01'),
      aSearch('e2', '2026-11-02'),
      aSearch('e3', '2026-11-03'),
    ]);
    const response = await view.get('/funnel.json?since=2026-11-02&until=2026-11-03');
    expect(response.headers.get('content-type')).toBe('application/json');
    const funnel = (await response.json()) as Funnel & { filters: object };
    expect(funnel.totals.searches).toBe(1);
    expect(funnel.filters).toEqual({
      from: '2026-11-02T00:00:00.000Z',
      to: '2026-11-03T00:00:00.000Z',
    });
    expect(view.lists[0]).toMatchObject({
      from: new Date('2026-11-02'),
      to: new Date('2026-11-03'),
    });
  });

  it('uses the default filters when the request sets none', async () => {
    const view = await aView([aSearch('e1', '2026-11-01'), aSearch('e2', '2026-11-02')], {
      filters: { from: new Date('2026-11-02T00:00:00Z') },
    });
    const funnel = (await (await view.get('/funnel.json')).json()) as Funnel;
    expect(funnel.totals.searches).toBe(1);
  });

  it('reuses a count for the refresh time and shares one read between requests', async () => {
    const view = await aView([aSearch('e1', '2026-11-02')]);
    await Promise.all([view.get('/'), view.get('/funnel.json')]);
    expect(view.lists).toHaveLength(1);
    await view.outbox.append(aSearch('e2', '2026-11-03'), signal);
    view.later(59_000);
    expect(((await (await view.get('/funnel.json')).json()) as Funnel).events).toBe(1);
    view.later(1000);
    expect(((await (await view.get('/funnel.json')).json()) as Funnel).events).toBe(2);
    expect(view.lists).toHaveLength(2);
  });

  it('answers 503 when the store fails, and reads again on the next request', async () => {
    let fail = true;
    const outbox = createInMemoryUsageOutbox();
    const view = createFunnelView({
      outbox: {
        list: (query, listSignal) =>
          fail ? Promise.reject(new Error('connection refused')) : outbox.list(query, listSignal),
      },
      publisher: 'Example Publisher',
      clock: { now: () => new Date('2026-11-03T12:00:00Z') },
      logger: createTestLogger(),
      source: 'test',
      refreshSeconds: 60,
      filters: {},
    });
    const get = () => view.fetch(new Request('http://127.0.0.1/'));
    expect((await get()).status).toBe(503);
    fail = false;
    expect((await get()).status).toBe(200);
  });

  it.each([
    ['/other', 'GET', 404],
    ['/', 'POST', 405],
    ['/?since=3%20Nov', 'GET', 400],
    ['/?until=2026-02-30', 'GET', 400],
    ['/', 'HEAD', 200],
  ])('answers %s %s with %i', async (path, method, status) => {
    const view = await aView([]);
    expect((await view.get(path, method)).status).toBe(status);
  });
});
