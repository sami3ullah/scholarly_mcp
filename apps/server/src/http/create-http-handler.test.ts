import type { McpHttpHandler } from '@modelcontextprotocol/server';
import {
  createFakeClock,
  createInMemoryApiKeyStore,
  createTestLogger,
} from '@scholarly-mcp/testkit';
import { afterEach, describe, expect, it } from 'vitest';
import { generateApiKey } from '../auth/api-key-secrets.js';
import { httpAuthFromConfig } from '../auth/http-auth-from-config.js';
import { authConfigSchema } from '../config/auth-config.js';
import { createMetrics } from '../telemetry/create-metrics.js';
import { startHarness, structured, type Harness } from '../testing/server-harness.js';
import { createHttpHandler, type HttpAuth, type HttpHandlerDeps } from './create-http-handler.js';

const LOCAL = ['localhost', '127.0.0.1', '[::1]'];
// Now, not a fixed date: the SDK checks a token's expiry against the wall clock, so a key
// accepted at a fixed past time would expire an hour after it.
const clock = createFakeClock(new Date());

function handlerWith(extra: Partial<HttpHandlerDeps> = {}) {
  const metrics = createMetrics({ defaults: false });
  const handler = createHttpHandler({
    mcp: { fetch: () => Promise.resolve(new Response('mcp reached')) },
    auth: { mode: 'none' },
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
    const { handler } = handlerWith({ auth: apiKeyAuth().auth, allowedHosts: ['mcp.example.org'] });
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

function apiKeyAuth() {
  const made = generateApiKey();
  const keys = createInMemoryApiKeyStore([
    { id: made.id, label: 'demo', secretHash: made.secretHash, createdAt: clock.now() },
  ]);
  const auth: HttpAuth = httpAuthFromConfig(authConfigSchema.parse({ AUTH_MODE: 'api-key' }), {
    keys,
    clock,
    logger: createTestLogger(),
  });
  return { made, keys, auth };
}

describe('createHttpHandler API key auth', () => {
  it('answers 401 with a Bearer challenge for a missing or wrong key, and counts it', async () => {
    const { handler, metrics } = handlerWith({ auth: apiKeyAuth().auth });
    const missing = await handler.fetch(post());
    expect(missing.status).toBe(401);
    expect(missing.headers.get('www-authenticate')).toMatch(/^Bearer/);
    const wrong = await handler.fetch(
      post({ authorization: `Bearer smk_key_aaaaaaaaaaaa_${'A'.repeat(43)}` }),
    );
    expect(wrong.status).toBe(401);
    expect(await metrics.registry.metrics()).toMatch(
      /auth_failures_total\{reason="invalid_token"\} 2/,
    );
  });
});

describe('createHttpHandler OAuth metadata', () => {
  it('serves Protected Resource Metadata naming the issuer and advertises it in 401s', async () => {
    const auth = httpAuthFromConfig(
      authConfigSchema.parse({
        AUTH_MODE: 'oauth',
        OAUTH_ISSUER: 'https://id.example.org',
        OAUTH_AUDIENCE: 'https://mcp.example.org/mcp',
        OAUTH_JWKS_URL: 'https://id.example.org/jwks',
        OAUTH_REQUIRED_SCOPES: 'mcp',
      }),
      { keys: { find: () => Promise.resolve(undefined) }, clock, logger: createTestLogger() },
    );
    const { handler } = handlerWith({ auth });
    const metadata = await handler.fetch(get('/.well-known/oauth-protected-resource/mcp'));
    expect(await metadata.json()).toEqual({
      resource: 'https://mcp.example.org/mcp',
      authorization_servers: ['https://id.example.org'],
      bearer_methods_supported: ['header'],
      scopes_supported: ['mcp'],
      resource_name: 'scholarly-mcp',
    });
    const challenge = (await handler.fetch(post())).headers.get('www-authenticate');
    expect(challenge).toContain(
      'resource_metadata="https://mcp.example.org/.well-known/oauth-protected-resource/mcp"',
    );
  });
});

describe('createHttpHandler API key and OAuth auth', () => {
  function combined() {
    const { made, keys } = apiKeyAuth();
    const auth = httpAuthFromConfig(
      authConfigSchema.parse({
        AUTH_MODE: 'api-key+oauth',
        OAUTH_ISSUER: 'https://id.example.org',
        OAUTH_AUDIENCE: 'https://mcp.example.org/mcp',
        OAUTH_JWKS_URL: 'https://id.example.org/jwks',
        OAUTH_REQUIRED_SCOPES: 'mcp',
      }),
      { keys, clock, logger: createTestLogger() },
    );
    return { made, ...handlerWith({ auth }) };
  }

  it('lets a valid API key through the resource and scope checks meant for OAuth tokens', async () => {
    const { made, handler } = combined();
    const response = await handler.fetch(post({ authorization: `Bearer ${made.key}` }));
    expect(await response.text()).toBe('mcp reached');
  });

  it('refuses a wrong key and challenges with the OAuth metadata, so OAuth clients can sign in', async () => {
    const { handler } = combined();
    const wrong = await handler.fetch(
      post({ authorization: `Bearer smk_key_aaaaaaaaaaaa_${'A'.repeat(43)}` }),
    );
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get('www-authenticate')).toContain(
      'resource_metadata="https://mcp.example.org/.well-known/oauth-protected-resource/mcp"',
    );
    const metadata = await handler.fetch(get('/.well-known/oauth-protected-resource/mcp'));
    expect(metadata.status).toBe(200);
  });
});

describe('the app behind the HTTP layer', () => {
  let harness: Harness | undefined;
  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it('serves a caller with a valid API key and records the key id on sessions and usage', async () => {
    const { made, auth } = apiKeyAuth();
    harness = await startHarness({
      http: {
        wrap: (mcp: McpHttpHandler) => handlerWith({ mcp, auth }).handler,
        headers: { authorization: `Bearer ${made.key}` },
      },
    });
    const result = await harness.call('search_articles', { query: 'rivaroxaban dosing' });
    expect(result.isError).not.toBe(true);
    const url = (structured(result)['cards'] as { url: string }[])[0]?.url ?? '';
    const token = new URL(url).searchParams.get('t');
    const session = await harness.sessions.find(token as never, new AbortController().signal);
    expect(session?.apiKeyId).toBe(made.id);
    await harness.flushMeter();
    expect(harness.outbox.all()).toEqual([
      expect.objectContaining({
        apiKeyId: made.id,
        tool: 'search_articles',
        status: 'ok',
        billable: true,
      }),
    ]);
  });

  it('refuses the MCP handshake without a key', async () => {
    await expect(
      startHarness({
        http: {
          wrap: (mcp: McpHttpHandler) => handlerWith({ mcp, auth: apiKeyAuth().auth }).handler,
        },
      }),
    ).rejects.toThrow();
  });
});
