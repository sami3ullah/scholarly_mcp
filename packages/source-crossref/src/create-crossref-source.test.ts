import { runSourceContract } from '@scholarly-mcp/testkit';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { walk, type RecordedPage } from './testing/crossref-fixtures.js';
import {
  WORKS,
  createTestSource,
  cursorAfter,
  fetchAll,
  recordedCrossref,
  useCrossrefServer,
} from './testing/source-harness.js';

const { server, requests } = useCrossrefServer();
const signal = new AbortController().signal;
const [page1, page2, endPage] = walk as [RecordedPage, RecordedPage, RecordedPage];
const doisOf = (page: RecordedPage) =>
  page.body.message.items.map((item) => String(item['DOI']).toLowerCase());

describe('Crossref source on recorded responses', () => {
  runSourceContract('crossref', {
    create: () => {
      server.use(recordedCrossref());
      return createTestSource().source;
    },
    updatedSince: new Date('2026-10-11T22:31:20Z'),
  });
});

describe('createCrossrefSource', () => {
  it('maps the recorded walk to canonical articles', async () => {
    server.use(recordedCrossref());
    const articles = await fetchAll(createTestSource().source);
    expect(articles.map((article) => article.doi)).toEqual([...doisOf(page1), ...doisOf(page2)]);
    expect(articles).toMatchSnapshot();
  });

  it('walks the prefix with cursors, sorted by deposit date, in the public pool', async () => {
    server.use(recordedCrossref());
    await fetchAll(createTestSource().source);
    expect(requests.map((url) => url.searchParams.get('cursor'))).toEqual(
      walk.map((page) => page.cursor),
    );
    expect(Object.fromEntries(requests[0]?.searchParams ?? [])).toEqual({
      filter: 'type:journal-article,from-pub-date:2024-01-01',
      sort: 'deposited',
      order: 'asc',
      rows: '3',
      cursor: '*',
    });
  });

  it('identifies itself and joins the polite pool when a mailto is set', async () => {
    let userAgent: string | null = null;
    server.use(
      http.get(WORKS, ({ request }) => {
        userAgent = request.headers.get('user-agent');
        return HttpResponse.json(endPage.body);
      }),
    );
    await createTestSource({ CROSSREF_MAILTO: 'ingest@example.org' }).source.fetchPage({}, signal);
    expect(requests[0]?.searchParams.get('mailto')).toBe('ingest@example.org');
    expect(userAgent).toContain('mailto:ingest@example.org');
  });

  it('syncs incrementally by update date and drops records before the exact instant', async () => {
    server.use(recordedCrossref());
    const updatedSince = new Date('2026-10-11T22:31:20Z');
    const articles = await fetchAll(createTestSource().source, updatedSince);
    expect(requests[0]?.searchParams.get('filter')).toContain('from-update-date:2026-10-11');
    expect(articles.map((article) => article.doi)).toEqual(doisOf(page2));
  });

  it('requests the empty end page, because the last full page still carries a cursor', async () => {
    expect(page2.body.message['next-cursor']).toBeDefined();
    expect(endPage.body.message['next-cursor']).toBeUndefined();
    server.use(recordedCrossref());
    const { source } = createTestSource();
    const last = await source.fetchPage({ cursor: await cursorAfter(source, 2) }, signal);
    expect(last).toEqual({ articles: [] });
    expect(requests).toHaveLength(3);
  });

  it('ends the walk on an empty page even if a cursor comes with it', async () => {
    const body = { ...endPage.body, message: { ...endPage.body.message, 'next-cursor': 'more' } };
    server.use(recordedCrossref([{ cursor: '*', body }]));
    expect(await createTestSource().source.fetchPage({}, signal)).toEqual({ articles: [] });
  });

  it('logs page counts but never record content', async () => {
    server.use(recordedCrossref());
    const { source, lines } = createTestSource();
    await source.fetchPage({}, signal);
    expect(lines.at(-1)).toMatchObject({
      level: 'info',
      fields: { source: 'crossref', emitted: 3, skipped: {}, invalid: 0, followedUp: 0 },
    });
    expect(JSON.stringify(lines)).not.toContain('Nanostructured');
  });

  it('rejects an unknown cursor as invalid input', async () => {
    await expect(
      createTestSource().source.fetchPage({ cursor: 'garbage' }, signal),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
