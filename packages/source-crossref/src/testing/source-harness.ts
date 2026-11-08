import type { Doi, Source } from '@scholarly-mcp/core';
import { createFakeClock, createTestLogger, type CapturedLine } from '@scholarly-mcp/testkit';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import type { CrossrefConfig } from '../config/crossref-config.js';
import { createCrossrefSource } from '../create-crossref-source.js';
import { retracted, walk, type RecordedPage } from './crossref-fixtures.js';

/** The works endpoint the tests intercept. */
export const WORKS = 'https://api.crossref.org/prefixes/10.1055/works';

/** Test config: three rows per page as recorded, a short timeout and few retries. */
const testConfig: CrossrefConfig = {
  CROSSREF_PREFIX: '10.1055',
  CROSSREF_FROM_PUB_DATE: '2024-01-01',
  CROSSREF_API_URL: 'https://api.crossref.org',
  CROSSREF_ROWS: 3,
  CROSSREF_TIMEOUT_MS: 50,
  CROSSREF_MAX_RETRIES: 3,
};

/** An expired or unknown cursor, as Crossref reports it. */
export const cursorInvalid = () =>
  HttpResponse.json({ status: 'failed', message: [{ type: 'cursor-invalid' }] }, { status: 404 });

/** Serves a recorded walk by cursor, and DOI lookups from the recorded retracted article. */
export function recordedCrossref(pages: readonly RecordedPage[] = walk) {
  return http.get(WORKS, ({ request }) => {
    const params = new URL(request.url).searchParams;
    if (params.get('filter')?.includes('doi:')) return HttpResponse.json(retracted);
    const page = pages.find((recorded) => recorded.cursor === params.get('cursor'));
    return page ? HttpResponse.json(page.body) : cursorInvalid();
  });
}

/** Starts an msw server for the calling test file and records every request URL. */
export function useCrossrefServer() {
  const server = setupServer();
  const requests: URL[] = [];
  server.events.on('request:start', ({ request }) => requests.push(new URL(request.url)));
  beforeAll(() => {
    server.listen({ onUnhandledFrame: 'error' });
  });
  afterEach(() => {
    server.resetHandlers();
    requests.length = 0;
  });
  afterAll(() => {
    server.close();
  });
  return { server, requests };
}

/**
 * A source with a fake clock, instant recorded sleeps, fixed jitter and a capturing logger;
 * with `dois`, one that looks up only those.
 */
export function createTestSource(overrides: Partial<CrossrefConfig> = {}, dois?: readonly Doi[]) {
  const clock = createFakeClock(new Date('2026-11-02T10:00:00Z'));
  const sleeps: number[] = [];
  const lines: CapturedLine[] = [];
  const source = createCrossrefSource({
    config: { ...testConfig, ...overrides },
    clock,
    logger: createTestLogger(lines),
    ...(dois && { dois }),
    random: () => 0.5,
    sleep: (ms, signal) => {
      signal.throwIfAborted();
      sleeps.push(ms);
      clock.advance(ms);
      return Promise.resolve();
    },
  });
  return { source, sleeps, lines };
}

/** Pages a source to the end and returns every article. */
export async function fetchAll(source: Source, updatedSince?: Date) {
  const signal = new AbortController().signal;
  const articles = [];
  let cursor: string | undefined;
  do {
    const page = await source.fetchPage(
      { ...(cursor !== undefined && { cursor }), ...(updatedSince && { updatedSince }) },
      signal,
    );
    articles.push(...page.articles);
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return articles;
}

/** Fetches `pages` pages from the start and returns the cursor for the next one. */
export async function cursorAfter(source: Source, pages: number): Promise<string> {
  const signal = new AbortController().signal;
  let cursor: string | undefined;
  for (let page = 0; page < pages; page += 1) {
    cursor = (await source.fetchPage(cursor === undefined ? {} : { cursor }, signal)).nextCursor;
  }
  if (cursor === undefined) throw new Error('The walk ended early');
  return cursor;
}
