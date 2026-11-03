// @vitest-environment node
import { tokenSchema, doiSchema } from '@scholarly-mcp/core';
import { createTestLogger, type CapturedLine } from '@scholarly-mcp/testkit';
import { describe, expect, it, vi } from 'vitest';
import { aLandingPage } from '../../../testing/a-landing-page';
import type { LandingEnv } from '../../../shared/lib/env';
import { fetchLandingPage } from './fetch-landing-page';
import { clientAddress, type LandingApiDeps } from './landing-api';
import { sendVisit } from './send-visit';

const token = tokenSchema.parse('pSSYWKV6y282qdANYe86LA');
const doi = doiSchema.parse('10.1055/a-1001');
const SECRET = 's'.repeat(40);
const env: LandingEnv = {
  LANDING_API_URL: 'http://api.internal:8080',
  LANDING_API_SECRET: SECRET,
  LANDING_API_TIMEOUT_MS: 3000,
  LOG_LEVEL: 'info',
};

function depsWith(answer: Response | Error, logs: CapturedLine[] = []) {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer),
  );
  const deps: LandingApiDeps = {
    env,
    fetch,
    logger: createTestLogger(logs),
    clientAddress: '203.0.113.7',
  };
  return { deps, fetch };
}

describe('fetchLandingPage', () => {
  it('asks for the token and DOI only, with the secret and a hashed visitor id', async () => {
    const { deps, fetch } = depsWith(Response.json(aLandingPage()));
    const result = await fetchLandingPage({ token, doi }, deps);
    expect(result).toMatchObject({ kind: 'page', page: { chosen: { doi } } });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(urlOf(url)).toBe(
      `http://api.internal:8080/landing/v1/page?t=${token}&doi=10.1055%2Fa-1001`,
    );
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${SECRET}`);
    expect(headers.get('x-landing-visitor')).toMatch(/^[\w-]{32}$/);
    expect(JSON.stringify(init)).not.toContain('203.0.113.7');
  });

  it('sends a reader with a DOI to doi.org when there is no page', async () => {
    const { deps } = depsWith(Response.json({ error: 'not_found' }, { status: 404 }));
    expect(await fetchLandingPage({ token, doi }, deps)).toEqual({
      kind: 'redirect',
      url: 'https://doi.org/10.1055/a-1001',
    });
  });

  it('shows not-found for a dead link without a DOI', async () => {
    const { deps } = depsWith(Response.json({ error: 'not_found' }, { status: 404 }));
    expect(await fetchLandingPage({ token }, deps)).toEqual({ kind: 'not-found' });
  });

  it('does not call the API for a link with neither token nor DOI', async () => {
    const { deps, fetch } = depsWith(Response.json({}));
    expect(await fetchLandingPage({}, deps)).toEqual({ kind: 'not-found' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['is unreachable', new Error('ECONNREFUSED')],
    ['fails', new Response('boom', { status: 500 })],
    ['rate-limits the reader', new Response(null, { status: 429 })],
    ['answers something that is not a page', Response.json({ chosen: 'nope' })],
  ])('sends the reader to the DOI when the API %s', async (_case, answer) => {
    const logs: CapturedLine[] = [];
    const { deps } = depsWith(answer, logs);
    expect(await fetchLandingPage({ token, doi }, deps)).toMatchObject({ kind: 'redirect' });
    expect(logs.map((line) => line.level)).toEqual(['warn']);
  });

  it('throws for the error page when the API fails and there is no DOI', async () => {
    const { deps } = depsWith(new Response('boom', { status: 503 }));
    await expect(fetchLandingPage({ token }, deps)).rejects.toThrow(/status 503/);
  });
});

describe('sendVisit', () => {
  it('posts the token and tool to the visits route', async () => {
    const { deps, fetch } = depsWith(new Response(null, { status: 204 }));
    await sendVisit({ t: token, tool: 'search_articles' }, deps);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(urlOf(url)).toBe('http://api.internal:8080/landing/v1/visits');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ t: token, tool: 'search_articles' });
  });

  it('logs and swallows a failure, as a visit is a side record', async () => {
    const logs: CapturedLine[] = [];
    const { deps } = depsWith(new Error('ECONNREFUSED'), logs);
    await expect(sendVisit({ t: token }, deps)).resolves.toBeUndefined();
    expect(logs[0]?.message).toBe('Landing visit not recorded');
  });
});

describe('clientAddress', () => {
  it('takes the first forwarded hop, else the real IP header', () => {
    expect(clientAddress(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe(
      '203.0.113.7',
    );
    expect(clientAddress(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(clientAddress(new Headers())).toBeUndefined();
  });
});

function urlOf(input: Parameters<typeof fetch>[0] | undefined): string | undefined {
  return input instanceof Request ? input.url : input?.toString();
}
