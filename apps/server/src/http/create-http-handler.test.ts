import type { McpHttpHandler } from '@modelcontextprotocol/server';
import { createTestLogger } from '@scholarly-mcp/testkit';
import { afterEach, describe, expect, it } from 'vitest';
import { createClientContext, rateLimitKeyOf } from '../limits/client-limit-key.js';
import { createMetrics } from '../telemetry/create-metrics.js';
import { startHarness, structured, type Harness } from '../testing/server-harness.js';
import { CLIENT_ADDRESS_HEADER } from './client-address.js';
import { createHttpHandler, type HttpHandlerDeps } from './create-http-handler.js';

const LOCAL = ['localhost', '127.0.0.1', '[::1]'];

function handlerWith(extra: Partial<HttpHandlerDeps> = {}) {
  const metrics = createMetrics({ defaults: false });
  const handler = createHttpHandler({
    mcp: { fetch: () => Promise.resolve(new Response('mcp reached')) },
    clientContext: createClientContext(),
    allowedHosts: LOCAL,
    allowedOrigins: LOCAL,
    readiness: () => ({ index: true, model: true }),
    metrics,
    logger: createTestLogger(),
    ...extra,
  });
  return { handler, metrics };
}

const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, { headers });
const post = (headers: Record<string, string> = {}) =>
  new Request('http://localhost/mcp', { method: 'POST', headers, body: '{}' });

describe('createHttpHandler routes', () => {
  it('answers health, readiness and metrics without auth or Host checks', async () => {
    const { handler } = handlerWith({ allowedHosts: ['mcp.example.org'] });
    expect((await handler.fetch(get('/healthz'))).status).toBe(200);
    expect(await (await handler.fetch(get('/readyz'))).json()).toEqual({
      status: 'ready',
      checks: { index: true, model: true },
    });
    const metrics = await handler.fetch(get('/metrics'));
    expect(metrics.headers.get('content-type')).toContain('text/plain');
    expect(await metrics.text()).toContain('http_requests_total');
  });

  it('leaves /metrics to the internal listener when told to', async () => {
    const { handler } = handlerWith({ exposeMetrics: false });
    expect((await handler.fetch(get('/metrics'))).status).toBe(404);
    expect((await handler.fetch(get('/healthz'))).status).toBe(200);
  });

  it('is not ready while any check fails, e.g. the index is missing or it is draining', async () => {
    const { handler } = handlerWith({
      readiness: () => ({ index: false, model: true, accepting: true }),
    });
    const response = await handler.fetch(get('/readyz'));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: 'not ready', checks: { index: false } });
  });

  it('answers 404 elsewhere, 405 for writes to ops routes and 414 for long URLs', async () => {
    const { handler } = handlerWith();
    expect((await handler.fetch(get('/admin'))).status).toBe(404);
    const write = new Request('http://localhost/healthz', { method: 'POST' });
    expect((await handler.fetch(write)).status).toBe(405);
    expect((await handler.fetch(get(`/mcp?${'q'.repeat(2100)}`))).status).toBe(414);
  });

  it('labels metrics by fixed routes, so random paths cannot grow the label set', async () => {
    const { handler, metrics } = handlerWith();
    await handler.fetch(get('/random-1'));
    await handler.fetch(get('/random-2'));
    const text = await metrics.registry.metrics();
    expect(text).toContain('http_requests_total{route="other",status="404"} 2');
    expect(text).not.toContain('random');
  });

  it('never sends CORS headers', async () => {
    const { handler } = handlerWith();
    for (const request of [
      get('/healthz'),
      post(),
      new Request('http://localhost/mcp', { method: 'OPTIONS' }),
    ]) {
      expect((await handler.fetch(request)).headers.get('access-control-allow-origin')).toBeNull();
    }
  });
});

describe('createHttpHandler /mcp guards', () => {
  it('passes a local request with no Origin to MCP', async () => {
    const { handler } = handlerWith();
    expect(await (await handler.fetch(post())).text()).toBe('mcp reached');
  });

  it('rejects a Host outside the allowlist and a cross-site Origin with 403', async () => {
    const { handler } = handlerWith({
      allowedHosts: ['mcp.example.org'],
      allowedOrigins: ['app.example.org'],
    });
    const rebound = new Request('http://evil.example/mcp', { method: 'POST', body: '{}' });
    expect((await handler.fetch(rebound)).status).toBe(403);
    const fromApp = new Request('http://mcp.example.org/mcp', {
      method: 'POST',
      headers: { origin: 'https://app.example.org' },
      body: '{}',
    });
    expect((await handler.fetch(fromApp)).status).toBe(200);
    const fromEvil = new Request('http://mcp.example.org/mcp', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
      body: '{}',
    });
    expect((await handler.fetch(fromEvil)).status).toBe(403);
  });
});

describe('createHttpHandler public /mcp', () => {
  function capturing() {
    const seen: (string | undefined)[] = [];
    const { handler } = handlerWith({
      mcp: {
        fetch: (_request, options) => {
          seen.push(rateLimitKeyOf(options?.authInfo));
          return Promise.resolve(new Response('mcp reached'));
        },
      },
    });
    return { handler, seen };
  }

  it('serves a request without credentials, and ignores any it sends', async () => {
    const { handler } = handlerWith();
    expect((await handler.fetch(post())).status).toBe(200);
    expect((await handler.fetch(post({ authorization: 'Bearer anything' }))).status).toBe(200);
  });

  it('gives each client address its own rate-limit key that does not reveal it', async () => {
    const { handler, seen } = capturing();
    await handler.fetch(post({ [CLIENT_ADDRESS_HEADER]: '203.0.113.7' }));
    await handler.fetch(post({ [CLIENT_ADDRESS_HEADER]: '203.0.113.7' }));
    await handler.fetch(post({ [CLIENT_ADDRESS_HEADER]: '198.51.100.1' }));
    const [first, again, other] = seen;
    expect(first).toMatch(/^client:[\w-]{22}$/);
    expect(again).toBe(first);
    expect(other).not.toBe(first);
    expect(seen.join()).not.toContain('203.0.113');
  });
});

describe('the app behind the HTTP layer', () => {
  let harness: Harness | undefined;
  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it('serves an anonymous client end to end, with sessions and usage recorded', async () => {
    harness = await startHarness({
      http: { wrap: (mcp: McpHttpHandler) => handlerWith({ mcp }).handler },
    });
    const result = await harness.call('search_articles', { query: 'rivaroxaban dosing' });
    expect(result.isError).not.toBe(true);
    const url = (structured(result)['cards'] as { url: string }[])[0]?.url ?? '';
    const token = new URL(url).searchParams.get('t');
    const session = await harness.sessions.find(token as never, new AbortController().signal);
    expect(session).toBeDefined();
    await harness.flushMeter();
    expect(harness.outbox.all()).toEqual([
      expect.objectContaining({ tool: 'search_articles', status: 'ok', billable: true }),
    ]);
  });
});
