import { HttpResponse, delay, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { walk, type RecordedPage } from './testing/crossref-fixtures.js';
import { WORKS, createTestSource, useCrossrefServer } from './testing/source-harness.js';

const { server, requests } = useCrossrefServer();
const signal = new AbortController().signal;
const [page1] = walk as [RecordedPage];

/** Answers with each response in turn, then with the recorded first page. */
function respondInTurn(...responses: (() => Response | Promise<Response>)[]) {
  let call = 0;
  server.use(
    http.get(WORKS, () => {
      const next = responses[call];
      call += 1;
      return next ? next() : HttpResponse.json(page1.body);
    }),
  );
}

const status =
  (code: number, headers: Record<string, string> = {}) =>
  () =>
    new HttpResponse(null, { status: code, headers });

describe('Crossref source under failure', () => {
  it('waits as long as Retry-After asks after a 429, then succeeds', async () => {
    respondInTurn(status(429, { 'retry-after': '2' }));
    const { source, sleeps, lines } = createTestSource();
    expect((await source.fetchPage({}, signal)).articles).toHaveLength(3);
    expect(sleeps).toEqual([2000]);
    expect(lines.find((line) => line.level === 'warn')?.fields).toMatchObject({
      reason: 'HTTP 429',
      attempt: 1,
      delayMs: 2000,
    });
  });

  it('honours Retry-After on a 503 too', async () => {
    respondInTurn(status(503, { 'retry-after': '1' }));
    const { source, sleeps } = createTestSource();
    await source.fetchPage({}, signal);
    expect(sleeps).toEqual([1000]);
  });

  it('backs off exponentially with jitter on repeated 5xx responses', async () => {
    respondInTurn(status(500), status(502), status(504));
    const { source, sleeps } = createTestSource();
    expect((await source.fetchPage({}, signal)).articles).toHaveLength(3);
    expect(sleeps).toEqual([500, 1000, 2000]);
    expect(requests).toHaveLength(4);
  });

  it('times out a hanging request and retries it', async () => {
    respondInTurn(async () => {
      await delay('infinite');
      return HttpResponse.json(page1.body);
    });
    const { source, lines } = createTestSource();
    expect((await source.fetchPage({}, signal)).articles).toHaveLength(3);
    expect(lines.find((line) => line.level === 'warn')?.fields).toMatchObject({
      reason: 'timeout',
    });
  });

  it('retries after a network error', async () => {
    respondInTurn(() => HttpResponse.error());
    const { source, lines } = createTestSource();
    expect((await source.fetchPage({}, signal)).articles).toHaveLength(3);
    expect(lines.find((line) => line.level === 'warn')?.fields).toMatchObject({
      reason: 'network error',
    });
  });

  it('retries a truncated JSON body', async () => {
    respondInTurn(
      () =>
        new HttpResponse('{"status":"ok","mess', {
          headers: { 'content-type': 'application/json' },
        }),
    );
    expect((await createTestSource().source.fetchPage({}, signal)).articles).toHaveLength(3);
  });

  it('gives up after the configured retries as source unavailable', async () => {
    respondInTurn(status(500), status(500), status(500), status(500));
    await expect(createTestSource().source.fetchPage({}, signal)).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
      message: expect.stringContaining('4 attempt(s)') as string,
    });
    expect(requests).toHaveLength(4);
  });

  it('gives up on persistent 429s as rate limited, saying when to retry', async () => {
    const limited = status(429, { 'retry-after': '5' });
    respondInTurn(limited, limited, limited, limited);
    await expect(createTestSource().source.fetchPage({}, signal)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryAfterSeconds: 5,
    });
  });

  it('does not wait out a Retry-After longer than the backoff cap', async () => {
    respondInTurn(status(429, { 'retry-after': '3600' }));
    const { source, sleeps } = createTestSource();
    await expect(source.fetchPage({}, signal)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryAfterSeconds: 3600,
    });
    expect(sleeps).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  it('does not retry a request Crossref rejects', async () => {
    respondInTurn(() =>
      HttpResponse.json(
        { status: 'failed', message: [{ type: 'validation-failure' }] },
        { status: 400 },
      ),
    );
    await expect(createTestSource().source.fetchPage({}, signal)).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
      message: expect.stringContaining('HTTP 400') as string,
    });
    expect(requests).toHaveLength(1);
  });

  it('fails on a response that is not a works list', async () => {
    respondInTurn(() => HttpResponse.json({ status: 'ok', message: { surprise: true } }));
    await expect(createTestSource().source.fetchPage({}, signal)).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
    });
  });

  it('skips a malformed record and keeps the rest of the page', async () => {
    const [first, ...rest] = page1.body.message.items;
    const broken = { ...first, deposited: 'yesterday' };
    const body = { ...page1.body, message: { ...page1.body.message, items: [broken, ...rest] } };
    respondInTurn(() => HttpResponse.json(body));
    const { source, lines } = createTestSource();
    expect((await source.fetchPage({}, signal)).articles).toHaveLength(2);
    expect(lines.at(-1)?.fields).toMatchObject({ emitted: 2, invalid: 1 });
  });

  it('spaces requests by the rate limit Crossref advertises', async () => {
    const limited = () =>
      HttpResponse.json(page1.body, {
        headers: { 'x-rate-limit-limit': '1', 'x-rate-limit-interval': '1s' },
      });
    respondInTurn(limited, limited);
    const { source, sleeps } = createTestSource();
    await source.fetchPage({}, signal);
    await source.fetchPage({}, signal);
    expect(sleeps).toEqual([1000]);
  });

  it('stops retrying as soon as the caller aborts', async () => {
    const controller = new AbortController();
    respondInTurn(() => {
      controller.abort();
      return new HttpResponse(null, { status: 500 });
    });
    await expect(createTestSource().source.fetchPage({}, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(requests).toHaveLength(1);
  });
});
