import {
  LANDING_SESSION_TTL_MS,
  landingPageSchema,
  tokenSchema,
  type LandingSession,
} from '@scholarly-mcp/core';
import { createFakeClock, createTestLogger } from '@scholarly-mcp/testkit';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttpHandler } from '../http/create-http-handler.js';
import { createMemoryBucketStore } from '../limits/create-memory-bucket-store.js';
import { createRateLimiter } from '../limits/create-rate-limiter.js';
import { createMetrics } from '../telemetry/create-metrics.js';
import { doi, startHarness, type Harness } from '../testing/server-harness.js';
import { VISITOR_HEADER, createLandingApi } from './create-landing-api.js';

const SECRET = 's'.repeat(40);
const signal = new AbortController().signal;
const token = tokenSchema.parse('TTTTTTTTTTTTTTTTTTTTTT');
const created = new Date('2026-11-02T10:00:00Z');
const live: LandingSession = {
  token,
  results: [{ doi: doi('10.1055/a-1001'), matchedChunkId: '10.1055/a-1001#0' }],
  language: 'en',
  tool: 'search_articles',
  apiKeyId: 'key_test',
  createdAt: created,
  expiresAt: new Date(created.getTime() + LANDING_SESSION_TTL_MS),
  visitCount: 0,
};

let harness: Harness | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

async function api(options: { secret?: string; burst?: number; session?: LandingSession } = {}) {
  harness = await startHarness();
  await harness.sessions.save(options.session ?? live, signal);
  const metrics = createMetrics({ defaults: false });
  const handler = createHttpHandler({
    landing: createLandingApi({
      pages: harness.landingPages,
      referrals: harness.referrals,
      limiter: createRateLimiter({
        store: createMemoryBucketStore(),
        name: 'landing',
        logger: createTestLogger(),
        perMinute: 60,
        burst: options.burst ?? 100,
        clock: createFakeClock(created),
      }),
      ...(options.secret !== undefined && { secret: options.secret }),
      metrics,
    }),
    auth: { mode: 'none' },
    allowedHosts: ['localhost'],
    allowedOrigins: ['localhost'],
    readiness: () => ({}),
    metrics,
    logger: createTestLogger(),
  });
  return { handler, metrics, sessions: harness.sessions, outbox: harness.outbox, harness };
}

const page = (query: string, headers: Record<string, string> = {}) =>
  new Request(`http://localhost/landing/v1/page?${query}`, { headers });
const post =
  (path: string) =>
  (body: unknown, headers: Record<string, string> = {}) =>
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
const visit = post('/landing/v1/visits');
const action = post('/landing/v1/actions');
const A1001 = '10.1055/a-1001';

describe('GET /landing/v1/page', () => {
  it('returns the page for a live token and DOI, uncached and not indexable', async () => {
    const { handler, metrics } = await api();
    const response = await handler.fetch(page(`t=${token}&doi=10.1055/A-1001`));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
    const body = landingPageSchema.parse(await response.json());
    expect(body).toMatchObject({ session: 'active', chosen: { doi: '10.1055/a-1001' } });
    expect(await metrics.registry.metrics()).toContain('landing_pages_total{session="active"} 1');
  });

  it('treats a malformed token as unavailable and still falls back to the DOI', async () => {
    const { handler } = await api();
    const response = await handler.fetch(page('t=not-a-token&doi=10.1055/a-1002'));
    expect(await response.json()).toMatchObject({
      session: 'unavailable',
      chosen: { doi: '10.1055/a-1002' },
    });
  });

  it('answers 404 when there is nothing to show and 400 for a malformed DOI', async () => {
    const { handler, metrics } = await api();
    expect((await handler.fetch(page('doi=10.1055/a-9999'))).status).toBe(404);
    expect((await handler.fetch(page(''))).status).toBe(404);
    expect((await handler.fetch(page('doi=banana'))).status).toBe(400);
    expect(await metrics.registry.metrics()).toContain(
      'landing_pages_total{session="not_found"} 2',
    );
  });

  it('never counts a visit when a page is read, so link previews use nothing up', async () => {
    const { handler, sessions } = await api();
    await handler.fetch(page(`t=${token}`));
    await handler.fetch(page(`t=${token}`));
    expect((await sessions.find(token, signal))?.visitCount).toBe(0);
  });
});

describe('POST /landing/v1/visits', () => {
  it('records a visit to a result by the tool that made the session', async () => {
    const { handler, metrics, sessions, outbox, harness: live } = await api();
    const response = await handler.fetch(visit({ t: token, doi: A1001, tool: 'cite' }));
    expect(response.status).toBe(204);
    expect((await sessions.find(token, signal))?.visitCount).toBe(1);
    expect(await metrics.registry.metrics()).toContain(
      'landing_visits_total{tool="search_articles"} 1',
    );
    await live.flushMeter();
    expect(outbox.all()).toEqual([
      expect.objectContaining({ kind: 'landing_visit', doi: A1001, tool: 'search_articles' }),
    ]);
  });

  it('answers unknown tokens and foreign DOIs the same way without counting anything', async () => {
    const { handler, metrics, outbox, harness: live } = await api();
    const other = 'UUUUUUUUUUUUUUUUUUUUUU';
    expect((await handler.fetch(visit({ t: other, doi: A1001 }))).status).toBe(204);
    expect((await handler.fetch(visit({ t: token, doi: '10.1055/a-1002' }))).status).toBe(204);
    expect(await metrics.registry.metrics()).not.toContain('landing_visits_total{');
    await live.flushMeter();
    expect(outbox.all()).toEqual([]);
  });

  it('falls back to the link campaign for an older session, and unknown beyond that', async () => {
    const old: LandingSession = { ...live };
    delete old.tool;
    const { handler, metrics } = await api({ session: old });
    await handler.fetch(visit({ t: token, doi: A1001, tool: 'find_related' }));
    expect(await metrics.registry.metrics()).toContain(
      'landing_visits_total{tool="find_related"} 1',
    );
    const again = await api({
      session: { ...old, token: tokenSchema.parse('VVVVVVVVVVVVVVVVVVVVVV') },
    });
    await again.handler.fetch(
      visit({ t: 'VVVVVVVVVVVVVVVVVVVVVV', doi: A1001, tool: 'newsletter' }),
    );
    expect(await again.metrics.registry.metrics()).toContain(
      'landing_visits_total{tool="unknown"} 1',
    );
  });

  it.each([
    ['a missing token', { doi: A1001 }],
    ['a missing DOI', { t: token }],
    ['extra fields', { t: token, doi: A1001, query: 'Vorhofflimmern' }],
    ['a malformed token', { t: 'abc', doi: A1001 }],
  ])('refuses a body with %s', async (_case, body) => {
    const { handler } = await api();
    expect((await handler.fetch(visit(body))).status).toBe(400);
  });

  it('refuses a body that is not JSON', async () => {
    const { handler } = await api();
    const request = new Request('http://localhost/landing/v1/visits', {
      method: 'POST',
      body: 'not json',
    });
    expect((await handler.fetch(request)).status).toBe(400);
  });
});

describe('POST /landing/v1/actions', () => {
  it('records an access button click and counts it by action', async () => {
    const { handler, metrics, sessions, outbox, harness: live } = await api();
    const response = await handler.fetch(action({ t: token, doi: A1001, action: 'read' }));
    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await metrics.registry.metrics()).toContain('landing_actions_total{action="read"} 1');
    expect((await sessions.find(token, signal))?.visitCount).toBe(0);
    await live.flushMeter();
    expect(outbox.all()).toEqual([
      expect.objectContaining({ kind: 'landing_action', action: 'read', doi: A1001 }),
    ]);
  });

  it('records nothing for an unknown token, still answering 204', async () => {
    const { handler, metrics } = await api();
    const body = { t: 'UUUUUUUUUUUUUUUUUUUUUU', doi: A1001, action: 'buy' };
    expect((await handler.fetch(action(body))).status).toBe(204);
    expect(await metrics.registry.metrics()).not.toContain('landing_actions_total{');
  });

  it.each([
    ['an unknown action', { t: token, doi: A1001, action: 'subscribe' }],
    ['a missing DOI', { t: token, action: 'read' }],
    ['extra fields', { t: token, doi: A1001, action: 'read', q: 'x' }],
  ])('refuses a body with %s', async (_case, body) => {
    const { handler } = await api();
    expect((await handler.fetch(action(body))).status).toBe(400);
  });

  it('takes the shared secret like the other routes', async () => {
    const { handler } = await api({ secret: SECRET });
    const body = { t: token, doi: A1001, action: 'read' };
    expect((await handler.fetch(action(body))).status).toBe(401);
    const signed = action(body, { authorization: `Bearer ${SECRET}` });
    expect((await handler.fetch(signed)).status).toBe(204);
  });
});

describe('landing API guards', () => {
  it('requires the shared secret when one is set', async () => {
    const { handler } = await api({ secret: SECRET });
    expect((await handler.fetch(page(`t=${token}`))).status).toBe(401);
    expect(
      (await handler.fetch(page(`t=${token}`, { authorization: `Bearer ${'x'.repeat(40)}` })))
        .status,
    ).toBe(401);
    expect(
      (await handler.fetch(page(`t=${token}`, { authorization: `Bearer ${SECRET}` }))).status,
    ).toBe(200);
  });

  it('limits each visitor separately and says when to retry', async () => {
    const { handler } = await api({ burst: 2 });
    const as = (visitor: string) => page(`t=${token}`, { [VISITOR_HEADER]: visitor });
    expect((await handler.fetch(as('a'))).status).toBe(200);
    expect((await handler.fetch(as('a'))).status).toBe(200);
    const limited = await handler.fetch(as('a'));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await handler.fetch(as('b'))).status).toBe(200);
  });

  it('checks the Host header against the allowlist', async () => {
    const { handler } = await api();
    const rebound = new Request(`http://evil.example/landing/v1/page?t=${token}`);
    expect((await handler.fetch(rebound)).status).toBe(403);
  });

  it('allows only its own method on each route, and 404 elsewhere', async () => {
    const { handler } = await api();
    const post = new Request('http://localhost/landing/v1/page', { method: 'POST' });
    const wrong = await handler.fetch(post);
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get('allow')).toBe('GET');
    expect((await handler.fetch(new Request('http://localhost/landing/v1/visits'))).status).toBe(
      405,
    );
    expect((await handler.fetch(page('').clone())).status).toBe(404);
    expect((await handler.fetch(new Request('http://localhost/landing/v1/other'))).status).toBe(
      404,
    );
  });

  it('serves no /mcp route when MCP runs on stdio', async () => {
    const { handler } = await api();
    const response = await handler.fetch(
      new Request('http://localhost/mcp', { method: 'POST', body: '{}' }),
    );
    expect(response.status).toBe(404);
  });
});
