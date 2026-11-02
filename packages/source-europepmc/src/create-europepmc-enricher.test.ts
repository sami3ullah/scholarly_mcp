import { DEFAULT_FULLTEXT_LICENSES, type FullTextRef } from '@scholarly-mcp/core';
import { runEnricherContract } from '@scholarly-mcp/testkit';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { MAX_CONSECUTIVE_FULLTEXT_FAILURES } from './create-europepmc-enricher.js';
import {
  FULL_TEXT,
  SEARCH,
  createTestEnricher,
  useEuropepmcServer,
} from './testing/enricher-harness.js';
import { NOW, allArticles, articles, searchBody } from './testing/europepmc-fixtures.js';

const { server, requests } = useEuropepmcServer();
const signal = new AbortController().signal;

runEnricherContract('Europe PMC enricher', {
  create: () => createTestEnricher().enricher,
  matched: [articles.endoscopy, articles.caseReport, articles.keywords],
  unmatched: articles.unmatched,
  allowlist: DEFAULT_FULLTEXT_LICENSES,
  now: NOW,
});

const endoscopyRef: FullTextRef = {
  source: 'europepmc',
  id: 'PMC11288659',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  revision: '2024-08-01',
};

describe('Europe PMC lookup', () => {
  it('finds subjects for matches and full text only where ADR 0003 allows it', async () => {
    const { enricher, lines } = createTestEnricher();
    const found = await enricher.lookup(allArticles, signal);

    expect([...found.keys()].sort()).toEqual(
      [
        articles.endoscopy,
        articles.caseReport,
        articles.german,
        articles.manuscript,
        articles.noFullText,
        articles.keywords,
      ]
        .map((article) => article.doi)
        .sort(),
    );
    expect(found.get(articles.endoscopy.doi)?.fullText).toEqual(endoscopyRef);
    expect(found.get(articles.caseReport.doi)?.fullText).toMatchObject({
      id: 'PMC11410396',
      licenseUrl: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
    });
    // Closed at Crossref and an author manuscript; CC BY but not in Europe PMC.
    expect(found.get(articles.manuscript.doi)?.fullText).toBeUndefined();
    expect(found.get(articles.noFullText.doi)?.fullText).toBeUndefined();

    const subjects = found.get(articles.endoscopy.doi)?.subjects ?? [];
    expect(subjects.length).toBeGreaterThan(0);
    expect(subjects.every((subject) => subject.origin === 'mesh')).toBe(true);
    expect(subjects.map((subject) => subject.label)).not.toContain('Humans');
    expect(found.get(articles.keywords.doi)?.subjects).toContainEqual({
      label: 'Biliary Atresia',
      origin: 'keyword',
    });
    expect(lines.at(-1)).toMatchObject({
      message: 'Europe PMC lookup done',
      fields: { requested: 7, matched: 6, withFullText: 4, invalid: 0 },
    });
  });

  it('searches in batches of the configured size', async () => {
    const { enricher } = createTestEnricher({ EUROPEPMC_BATCH_SIZE: 3 });
    const found = await enricher.lookup(allArticles, signal);
    expect(requests).toHaveLength(3);
    expect(found.size).toBe(6);
    const query = requests[0]?.searchParams.get('query');
    expect(query).toBe(
      allArticles
        .slice(0, 3)
        .map((article) => `DOI:"${article.doi}"`)
        .join(' OR '),
    );
    expect(requests[0]?.searchParams.get('resultType')).toBe('core');
  });

  it('makes no request for no articles', async () => {
    await createTestEnricher().enricher.lookup([], signal);
    expect(requests).toHaveLength(0);
  });

  it('follows the cursor while Europe PMC has more hits', async () => {
    const [first, ...rest] = searchBody.resultList.result;
    server.use(
      http.get(SEARCH, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursorMark');
        return cursor === '*'
          ? HttpResponse.json({
              hitCount: 7,
              nextCursorMark: 'AoE',
              resultList: { result: [first] },
            })
          : HttpResponse.json({ hitCount: 7, nextCursorMark: 'AoE', resultList: { result: rest } });
      }),
    );
    const found = await createTestEnricher().enricher.lookup(allArticles, signal);
    expect(requests.map((url) => url.searchParams.get('cursorMark'))).toEqual(['*', 'AoE']);
    expect(found.size).toBe(6);
  });

  it('counts a malformed hit and keeps the rest', async () => {
    server.use(
      http.get(SEARCH, () =>
        HttpResponse.json({
          ...searchBody,
          resultList: { result: [{ doi: 42 }, ...searchBody.resultList.result] },
        }),
      ),
    );
    const { enricher, lines } = createTestEnricher();
    expect((await enricher.lookup(allArticles, signal)).size).toBe(6);
    expect(lines.at(-1)?.fields).toMatchObject({ invalid: 1 });
  });

  it('fails the lookup when the search is refused or answers an unexpected shape', async () => {
    server.use(http.get(SEARCH, () => HttpResponse.json({ error: 'bad query' }, { status: 400 })));
    await expect(createTestEnricher().enricher.lookup(allArticles, signal)).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
      message: expect.stringContaining('HTTP 400') as string,
    });
    server.use(http.get(SEARCH, () => HttpResponse.json({ surprise: true })));
    await expect(createTestEnricher().enricher.lookup(allArticles, signal)).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
    });
  });
});

describe('Europe PMC full text', () => {
  it('reads the recorded CC BY text into generically labelled sections', async () => {
    const sections = await createTestEnricher().enricher.fetchFullText(
      articles.endoscopy.doi,
      endoscopyRef,
      signal,
    );
    expect(sections?.map((section) => section.label)).toEqual([
      'Introduction',
      'Methods',
      'Results',
      'Discussion',
    ]);
  });

  it('skips a text that is not the version the reference names', async () => {
    const { enricher, lines } = createTestEnricher();
    const sections = await enricher.fetchFullText(articles.caseReport.doi, endoscopyRef, signal);
    expect(sections).toBeUndefined();
    expect(lines.at(-1)).toMatchObject({
      message: 'Full text not used',
      fields: { reason: 'doi mismatch' },
    });
  });

  it('skips a missing text', async () => {
    server.use(http.get(FULL_TEXT, () => new HttpResponse(null, { status: 404 })));
    const { enricher, lines } = createTestEnricher();
    expect(await enricher.fetchFullText(articles.endoscopy.doi, endoscopyRef, signal)).toBe(
      undefined,
    );
    expect(lines.at(-1)?.fields).toMatchObject({ status: 404 });
  });

  it('skips a text that keeps failing, and fails the run when every text does', async () => {
    const { enricher, sleeps } = createTestEnricher();
    const ref = { ...endoscopyRef, id: 'PMC404' };
    for (let attempt = 1; attempt < MAX_CONSECUTIVE_FULLTEXT_FAILURES; attempt += 1) {
      expect(await enricher.fetchFullText(articles.endoscopy.doi, ref, signal)).toBeUndefined();
    }
    expect(sleeps.length).toBeGreaterThan(0);
    await expect(enricher.fetchFullText(articles.endoscopy.doi, ref, signal)).rejects.toMatchObject(
      { code: 'SOURCE_UNAVAILABLE' },
    );
  });

  it('resets the failure count after a text arrives', async () => {
    const { enricher } = createTestEnricher();
    const broken = { ...endoscopyRef, id: 'PMC404' };
    for (let round = 0; round < 2; round += 1) {
      for (let attempt = 1; attempt < MAX_CONSECUTIVE_FULLTEXT_FAILURES; attempt += 1) {
        await enricher.fetchFullText(articles.endoscopy.doi, broken, signal);
      }
      expect(
        await enricher.fetchFullText(articles.endoscopy.doi, endoscopyRef, signal),
      ).toBeDefined();
    }
  });

  it('rethrows rate limiting instead of skipping the text', async () => {
    server.use(
      http.get(
        FULL_TEXT,
        () => new HttpResponse(null, { status: 429, headers: { 'retry-after': '3600' } }),
      ),
    );
    await expect(
      createTestEnricher().enricher.fetchFullText(articles.endoscopy.doi, endoscopyRef, signal),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('asks for XML in a way the full-text route accepts', async () => {
    let accept: string | null = null;
    server.use(
      http.get(FULL_TEXT, ({ request }) => {
        accept = request.headers.get('accept');
        return new HttpResponse(null, { status: 404 });
      }),
    );
    await createTestEnricher().enricher.fetchFullText(articles.endoscopy.doi, endoscopyRef, signal);
    expect(accept).toContain('application/xml');
  });
});
