import { createFakeClock, createTestLogger, type CapturedLine } from '@scholarly-mcp/testkit';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createHttpClient, type HttpClientOptions } from './create-http-client.js';

const URL_ = new URL('https://api.example.org/items');
const server = setupServer();
const signal = new AbortController().signal;

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

function respondInTurn(...responses: (() => Response)[]) {
  let call = 0;
  server.use(
    http.get(URL_.href, () => {
      const next = responses[call] ?? (() => HttpResponse.text('ok'));
      call += 1;
      return next();
    }),
  );
}

function createClient(overrides: Partial<HttpClientOptions> = {}) {
  const clock = createFakeClock(new Date('2026-11-02T10:00:00Z'));
  const sleeps: number[] = [];
  const lines: CapturedLine[] = [];
  const client = createHttpClient({
    name: 'Example',
    fetch: globalThis.fetch,
    clock,
    sleep: (ms) => {
      sleeps.push(ms);
      clock.advance(ms);
      return Promise.resolve();
    },
    random: () => 0.5,
    logger: createTestLogger(lines),
    userAgent: 'test',
    accept: 'text/plain',
    timeoutMs: 50,
    maxRetries: 2,
    ...overrides,
  });
  return { client, sleeps, lines };
}

const asText = (text: string) => text;

describe('createHttpClient', () => {
  it('sends the configured accept header and returns the read body', async () => {
    let accept: string | null = null;
    server.use(
      http.get(URL_.href, ({ request }) => {
        accept = request.headers.get('accept');
        return HttpResponse.text('hello');
      }),
    );
    const { client } = createClient();
    await expect(client.get(URL_, asText, signal)).resolves.toEqual({
      status: 200,
      body: 'hello',
    });
    expect(accept).toBe('text/plain');
  });

  it('spaces requests by the fixed minimum gap', async () => {
    respondInTurn();
    const { client, sleeps } = createClient({ minGapMs: 200 });
    await client.get(URL_, asText, signal);
    await client.get(URL_, asText, signal);
    expect(sleeps).toEqual([200]);
  });

  it('lets an advertised gap win over the fixed one', async () => {
    respondInTurn();
    const { client, sleeps } = createClient({ minGapMs: 200, gapFromHeaders: () => 1000 });
    await client.get(URL_, asText, signal);
    await client.get(URL_, asText, signal);
    expect(sleeps).toEqual([1000]);
  });

  it('retries when the reader cannot read the body', async () => {
    let reads = 0;
    respondInTurn();
    const { client, lines } = createClient();
    const result = await client.get(
      URL_,
      (text) => {
        reads += 1;
        if (reads === 1) throw new Error('cut off');
        return text;
      },
      signal,
    );
    expect(result.body).toBe('ok');
    expect(lines.find((line) => line.level === 'warn')).toMatchObject({
      message: 'Example request failed, retrying',
      fields: { reason: 'unreadable body' },
    });
  });

  it('names the API when it gives up', async () => {
    const failing = () => new HttpResponse(null, { status: 500 });
    respondInTurn(failing, failing, failing);
    await expect(createClient().client.get(URL_, asText, signal)).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
      message: 'Example request failed after 3 attempt(s): HTTP 500',
    });
  });
});
