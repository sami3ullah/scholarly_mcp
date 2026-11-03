import {
  LANDING_SESSION_TTL_MS,
  landingPageSchema,
  tokenSchema,
  type LandingSession,
} from '@scholarly-mcp/core';
import { createFakeClock, createTestLogger } from '@scholarly-mcp/testkit';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttpHandler } from '../http/create-http-handler.js';
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

async function api(options: { secret?: string; burst?: number } = {}) {
  harness = await startHarness();
  await harness.sessions.save(live, signal);
  const metrics = createMetrics({ defaults: false });
  const handler = createHttpHandler({
    landing: createLandingApi({
      pages: harness.landingPages,
      limiter: createRateLimiter({
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
  return { handler, metrics, sessions: harness.sessions };
}

const page = (query: string, headers: Record<string, string> = {}) =>
  new Request(`http://localhost/landing/v1/page?${query}`, { headers });
const visit = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost/landing/v1/visits', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

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
  it('counts a visit on a live token by the tool that made the link', async () => {
    const { handler, metrics, sessions } = await api();
    const response = await handler.fetch(visit({ t: token, tool: 'search_articles' }));
    expect(response.status).toBe(204);
    expect((await sessions.find(token, signal))?.visitCount).toBe(1);
    expect(await metrics.registry.metrics()).toContain(
      'landing_visits_total{tool="search_articles"} 1',
    );
  });

  it('answers unknown tokens the same way without counting anything', async () => {
    const { handler, metrics } = await api();
    const other = 'UUUUUUUUUUUUUUUUUUUUUU';
    expect((await handler.fetch(visit({ t: other }))).status).toBe(204);
    expect(await metrics.registry.metrics()).not.toContain('landing_visits_total{');
  });

  it('counts a tool it does not know as unknown', async () => {
    const { handler, metrics } = await api();
    await handler.fetch(visit({ t: token, tool: 'newsletter' }));
    expect(await metrics.registry.metrics()).toContain('landing_visits_total{tool="unknown"} 1');
  });

  it.each([
    ['a missing token', {}],
    ['extra fields', { t: token, query: 'Vorhofflimmern' }],
    ['a malformed token', { t: 'abc' }],
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
