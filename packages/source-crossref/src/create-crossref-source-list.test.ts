import type { Doi } from '@scholarly-mcp/core';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { aCrossrefWork } from './testing/a-crossref-work.js';
import { WORKS, createTestSource, fetchAll, useCrossrefServer } from './testing/source-harness.js';

const { server, requests } = useCrossrefServer();
const signal = new AbortController().signal;

/** 45 DOIs, so a run takes three batches of up to 20. */
const dois = Array.from(
  { length: 45 },
  (_, n) => `10.1055/a-0000-${String(n).padStart(4, '0')}` as Doi,
);
/** Crossref does not know these, as for a DOI that was never registered. */
const unknown = new Set(dois.slice(0, 2));

/** Answers DOI lookups with a work for each known DOI, the second half deposited later. */
function lookups() {
  return http.get(WORKS, ({ request }) => {
    const filter = new URL(request.url).searchParams.get('filter') ?? '';
    const asked = filter
      .split(',')
      .filter((part) => part.startsWith('doi:'))
      .map((part) => part.slice('doi:'.length) as Doi);
    const items = asked
      .filter((doi) => !unknown.has(doi))
      .map((doi) =>
        aCrossrefWork({
          DOI: doi.toUpperCase(),
          deposited: {
            'date-time': dois.indexOf(doi) < 25 ? '2026-10-01T00:00:00Z' : '2026-10-20T00:00:00Z',
          },
        }),
      );
    return HttpResponse.json({
      status: 'ok',
      message: { 'total-results': items.length, items },
    });
  });
}

describe('createCrossrefSource with a DOI list', () => {
  it('looks the listed DOIs up in batches of 20 within the scope and emits what exists', async () => {
    server.use(lookups());
    const articles = await fetchAll(createTestSource({}, dois).source);
    expect(articles.map((article) => article.doi)).toEqual(dois.slice(2));
    expect(requests.map((url) => url.searchParams.get('rows'))).toEqual(['20', '20', '5']);
    expect(requests[0]?.searchParams.get('filter')).toMatch(
      /^type:journal-article,from-pub-date:2024-01-01,doi:10\.1055\/a-0000-0000,/,
    );
    expect(requests[0]?.searchParams.has('cursor')).toBe(false);
  });

  it('asks for each DOI once', async () => {
    server.use(lookups());
    const articles = await fetchAll(createTestSource({}, [...dois, ...dois]).source);
    expect(articles).toHaveLength(43);
    expect(requests).toHaveLength(3);
  });

  it('syncs incrementally by deposit date', async () => {
    server.use(lookups());
    const articles = await fetchAll(
      createTestSource({}, dois).source,
      new Date('2026-10-10T00:00:00Z'),
    );
    expect(articles.map((article) => article.doi)).toEqual(dois.slice(25));
  });

  it('resumes from a cursor and ends after the last batch', async () => {
    server.use(lookups());
    const { source } = createTestSource({}, dois);
    const first = await source.fetchPage({}, signal);
    expect(first.nextCursor).toBeDefined();
    const second = await source.fetchPage({ cursor: first.nextCursor ?? '' }, signal);
    const last = await source.fetchPage({ cursor: second.nextCursor ?? '' }, signal);
    expect(last.articles).toHaveLength(5);
    expect(last.nextCursor).toBeUndefined();
  });

  it('logs counts, including DOIs Crossref did not know, but no DOIs or content', async () => {
    server.use(lookups());
    const { source, lines } = createTestSource({}, dois);
    await source.fetchPage({}, signal);
    expect(lines.at(-1)).toMatchObject({
      level: 'info',
      fields: { source: 'crossref', emitted: 18, skipped: {}, notFound: 2, followedUp: 0 },
    });
    expect(JSON.stringify(lines)).not.toContain('a-0000-');
  });

  it('rejects a walk cursor as invalid input', async () => {
    const walkCursor = Buffer.from('{"v":1,"crossref":"*"}').toString('base64url');
    await expect(
      createTestSource({}, dois).source.fetchPage({ cursor: walkCursor }, signal),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
