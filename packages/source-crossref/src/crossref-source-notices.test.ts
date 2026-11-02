import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { notices, retracted, walk, type RecordedPage } from './testing/crossref-fixtures.js';
import {
  WORKS,
  createTestSource,
  cursorAfter,
  cursorInvalid,
  recordedCrossref,
  useCrossrefServer,
} from './testing/source-harness.js';

const { server, requests } = useCrossrefServer();
const signal = new AbortController().signal;
const [page1, page2, endPage] = walk as [RecordedPage, RecordedPage, RecordedPage];

describe('Crossref source with an expired cursor', () => {
  it('restarts from the latest deposit already seen and does not lose records', async () => {
    let expired = false;
    server.use(
      http.get(WORKS, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        if (cursor === page2.cursor && !expired) {
          expired = true;
          return cursorInvalid();
        }
        return HttpResponse.json(walk.find((page) => page.cursor === cursor)?.body);
      }),
    );
    const { source, lines } = createTestSource();
    const resumeFrom = await cursorAfter(source, 1);

    const restarted = await source.fetchPage({ cursor: resumeFrom }, signal);
    const rest = await source.fetchPage({ cursor: restarted.nextCursor ?? '' }, signal);

    const watermark = page1.body.message.items.at(-1);
    expect(restarted.articles.map((article) => article.doi)).toEqual([
      String(watermark?.['DOI']).toLowerCase(),
    ]);
    expect(rest.articles).toHaveLength(page2.body.message.items.length);
    expect(requests.map((url) => url.searchParams.get('cursor'))).toEqual([
      '*',
      page2.cursor,
      '*',
      page2.cursor,
    ]);
    for (const url of requests.slice(2)) {
      expect(url.searchParams.get('filter')).toContain('from-update-date:2026-10-11');
    }
    expect(lines.find((line) => line.level === 'warn')?.message).toContain('restarting');
  });

  it('fails when even a fresh cursor is rejected', async () => {
    server.use(http.get(WORKS, cursorInvalid));
    await expect(createTestSource().source.fetchPage({}, signal)).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
    });
  });
});

describe('Crossref source with notices and retractions', () => {
  const noticePages: RecordedPage[] = [
    { cursor: '*', body: { message: { ...notices.message, 'next-cursor': 'notices-end' } } },
    { cursor: 'notices-end', body: endPage.body },
  ].map((page) => ({ ...page, body: { ...notices, ...page.body } }));

  it('skips notices, keeps retracted articles flagged, and fetches what a notice retracts', async () => {
    server.use(recordedCrossref(noticePages));
    const { source, lines } = createTestSource();
    const page = await source.fetchPage({}, signal);

    expect(
      Object.fromEntries(page.articles.map((article) => [article.doi, article.isRetracted])),
    ).toEqual({ '10.1055/s-2004-817674': true, '10.1055/a-2458-7088': true });
    expect(lines.at(-1)?.fields).toMatchObject({ skipped: { notice: 3 }, followedUp: 1 });
    expect(requests[1]?.searchParams.get('filter')).toBe(
      'type:journal-article,from-pub-date:2024-01-01,doi:10.1055/a-2458-7088',
    );
  });

  it('dates a followed-up retraction no earlier than its notice', async () => {
    server.use(recordedCrossref(noticePages));
    const page = await createTestSource().source.fetchPage({}, signal);
    const notice = notices.message.items.find((item) => item['DOI'] === '10.1055/a-2575-5491');
    const noticeDate = new Date(
      String((notice?.['deposited'] as { 'date-time': string } | undefined)?.['date-time']),
    );
    const original = page.articles.find((article) => article.doi === '10.1055/a-2458-7088');
    expect(original?.sourceUpdatedAt.getTime()).toBeGreaterThanOrEqual(noticeDate.getTime());
    expect(retracted.message.items).toHaveLength(1);
  });
});
