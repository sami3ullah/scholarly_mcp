import {
  isAppError,
  type Article,
  type ArticleSearch,
  type Chunk,
  type Doi,
  type SearchFilters,
} from '@scholarly-mcp/core';
import {
  aChunk,
  anArticle,
  createFakeClock,
  createFakeEmbedder,
  createInMemoryArticleStore,
  createTestLogger,
  type CapturedLine,
  type InMemoryArticleStore,
} from '@scholarly-mcp/testkit';
import fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchRequest, SearchServiceDeps } from './search-types.js';
import { createSearchService } from './create-search-service.js';

const signal = new AbortController().signal;
const embedder = createFakeEmbedder();

interface Fixture {
  readonly article: Article;
  readonly chunks: readonly { text: string; section?: string; language?: string }[];
}

const fixtures: Fixture[] = [
  {
    article: anArticle()
      .withDoi('10.1055/a-1')
      .withTitle('Rivaroxaban dosing in atrial fibrillation')
      .withAbstract('Results: Lower doses were safe.\n\nConclusion: Rivaroxaban can be reduced.')
      .publishedIn(2024, 3)
      .build(),
    chunks: [
      { text: 'Lower rivaroxaban doses were safe in elderly patients', section: 'Results' },
      { text: 'Rivaroxaban can be reduced in elderly patients', section: 'Conclusion' },
    ],
  },
  {
    article: anArticle()
      .withDoi('10.1055/a-2')
      .withTitle('Vorhofflimmern im Alter')
      .withLanguage('de')
      .withAbstract('Antikoagulation bei älteren Patienten mit Vorhofflimmern.')
      .publishedIn(2025, 1)
      .openAccess()
      .build(),
    chunks: [{ text: 'Antikoagulation bei älteren Patienten mit Vorhofflimmern', language: 'de' }],
  },
  {
    article: anArticle()
      .withDoi('10.1055/a-3')
      .withTitle('Hip replacement outcomes')
      .withAbstract('Stroke was rare after hip replacement.')
      .publishedIn(2023)
      .build(),
    chunks: [{ text: 'Stroke was rare after hip replacement in elderly patients' }],
  },
  {
    article: anArticle()
      .withDoi('10.1055/a-4')
      .withTitle('Rivaroxaban dosing, a retracted study')
      .publishedIn(2025)
      .retracted()
      .build(),
    chunks: [{ text: 'Rivaroxaban doses in elderly patients' }],
  },
];

async function chunksOf({ article, chunks }: Fixture): Promise<Chunk[]> {
  const vectors = await embedder.embedPassages(
    chunks.map(({ text }) => `${article.title} ${text}`),
    signal,
  );
  return chunks.map(({ text, section, language }, ordinal) => {
    let builder = aChunk()
      .of(article.doi, ordinal)
      .withText(text)
      .withEmbedding(...(vectors[ordinal] ?? []))
      .withModelVersion(embedder.modelVersion)
      .withLanguage(language ?? 'en');
    if (section !== undefined) builder = builder.inSection(section);
    return builder.build();
  });
}

describe('createSearchService', () => {
  let store: InMemoryArticleStore;
  let logs: CapturedLine[];

  const service = (overrides: Partial<SearchServiceDeps> = {}) =>
    createSearchService({
      reader: store,
      search: store,
      embedder,
      clock: createFakeClock(),
      logger: createTestLogger(logs),
      ...overrides,
    });

  const request = (query: string, more: Partial<SearchRequest> = {}): SearchRequest => ({
    query,
    filters: {},
    limit: 5,
    ...more,
  });

  const dois = async (query: string, filters: SearchFilters = {}) =>
    (await service().search(request(query, { filters }), signal)).hits.map(
      ({ article }) => article.doi,
    );

  const codeOf = async (promise: Promise<unknown>) => {
    const error: unknown = await promise.catch((caught: unknown) => caught);
    return isAppError(error) ? { code: error.code, field: error.field } : error;
  };

  beforeEach(async () => {
    logs = [];
    store = createInMemoryArticleStore();
    const records = await Promise.all(
      fixtures.map(async (fixture) => ({
        article: fixture.article,
        chunks: await chunksOf(fixture),
      })),
    );
    await store.upsert(records, signal);
    await store.writeIndexMeta(
      {
        version: 'v1',
        modelVersion: embedder.modelVersion,
        articleCount: records.length,
        chunkCount: 5,
        builtAt: new Date('2026-11-02T10:00:00Z'),
      },
      signal,
    );
  });

  describe('text queries', () => {
    it('returns one result per article, best first, with teaser and match label', async () => {
      const { hits, indexVersion } = await service().search(request('rivaroxaban dosing'), signal);
      expect(indexVersion).toBe('v1');
      const [best] = hits;
      expect(best?.article.doi).toBe('10.1055/a-1');
      expect(best?.teaser).toBe('Rivaroxaban can be reduced.');
      expect(best?.whyMatched).toMatch(/^Matched in (Results|Conclusion): rivaroxaban/);
      expect(best?.matchedChunkId).toMatch(/^10\.1055\/a-1#/);
      expect(hits.filter(({ article }) => article.doi === '10.1055/a-1')).toHaveLength(1);
    });

    it('excludes retracted articles', async () => {
      expect(await dois('rivaroxaban')).not.toContain('10.1055/a-4');
    });

    it('applies filters to both sides', async () => {
      expect(await dois('Vorhofflimmern patients', { language: 'de' })).toEqual(['10.1055/a-2']);
      expect(await dois('Vorhofflimmern patients', { openAccessOnly: true })).toEqual([
        '10.1055/a-2',
      ]);
      expect(await dois('Vorhofflimmern patients', { yearFrom: 2023, yearTo: 2023 })).toEqual([
        '10.1055/a-3',
      ]);
    });

    it('boosts the article whose title is the query', async () => {
      expect((await dois('Hip replacement outcomes'))[0]).toBe('10.1055/a-3');
    });

    it('searches a stopword-only query by meaning alone', async () => {
      const lexical = vi.fn<ArticleSearch['lexical']>((query, s) => store.lexical(query, s));
      const search: ArticleSearch = { lexical, vector: (query, s) => store.vector(query, s) };
      const { hits } = await service({ search }).search(request('die der das'), signal);
      expect(lexical).not.toHaveBeenCalled();
      expect(Array.isArray(hits)).toBe(true);
    });

    it('passes expansions and a clear query language to the lexical side', async () => {
      const lexical = vi.fn<ArticleSearch['lexical']>((query, s) => store.lexical(query, s));
      const vector: ArticleSearch['vector'] = (query, s) => store.vector(query, s);
      await service({ search: { lexical, vector } }).search(
        request('Die Behandlung der Patienten mit VHF im Alter'),
        signal,
      );
      const query = lexical.mock.calls[0]?.[0];
      expect(query?.language).toBe('de');
      expect(query?.limit).toBe(50);
      expect(query?.terms).toEqual(
        expect.arrayContaining(['VHF', 'Vorhofflimmern', 'atrial fibrillation']),
      );
    });

    it('ranks an exact word match above a neighbour by meaning at the same rank', async () => {
      const hit = (doi: string) => [
        { chunkId: `${doi}#0`, doi: doi as Doi, rank: 1, similarity: 0.9 },
      ];
      const search: ArticleSearch = {
        lexical: () => Promise.resolve(hit('10.1055/a-3')),
        vector: ({ filters }) =>
          Promise.resolve(filters.language === 'de' ? [] : hit('10.1055/a-1')),
      };
      const { hits } = await service({ search }).search(request('duodenography'), signal);
      expect(hits.map(({ article }) => article.doi)).toEqual(['10.1055/a-3', '10.1055/a-1']);
    });

    describe('language lanes', () => {
      const hits = (...entries: [doi: string, similarity: number][]) =>
        entries.map(([doi, similarity], index) => ({
          chunkId: `${doi}#0`,
          doi: doi as Doi,
          rank: index + 1,
          similarity,
        }));
      /** a-2 matches by word; the vector side answers per lane. */
      const byLane = (filters: SearchFilters) => (filters.language === 'de' ? 'de' : 'other');
      const laneSearch = (vector: Record<'de' | 'other', ReturnType<typeof hits>>) => ({
        lexical: vi.fn<ArticleSearch['lexical']>(() => Promise.resolve(hits(['10.1055/a-2', 0]))),
        vector: vi.fn<ArticleSearch['vector']>(({ filters }) =>
          Promise.resolve(vector[byLane(filters)]),
        ),
      });

      it('searches German passages and all others apart by meaning, by word once', async () => {
        const search = laneSearch({ de: [], other: [] });
        await service({ search }).search(request('Vorhofflimmern'), signal);
        expect(search.lexical.mock.calls.map(([query]) => query.filters)).toEqual([{}]);
        expect(search.vector.mock.calls.map(([query]) => query.filters)).toEqual([
          { language: 'de' },
          { excludeLanguage: 'de' },
        ]);
      });

      it('searches once when a language is asked for', async () => {
        const search = laneSearch({ de: [], other: [] });
        await service({ search }).search(
          request('Vorhofflimmern', { filters: { language: 'en' } }),
          signal,
        );
        expect(search.vector.mock.calls.map(([query]) => query.filters)).toEqual([
          { language: 'en' },
        ]);
      });

      it("puts the other language's nearest article on the page", async () => {
        const search = laneSearch({
          de: hits(['10.1055/a-2', 0.9]),
          other: hits(['10.1055/a-1', 0.88], ['10.1055/a-3', 0.87]),
        });
        const { hits: found } = await service({ search }).search(request('Vorhofflimmern'), signal);
        expect(found.map(({ article }) => article.doi)).toEqual([
          '10.1055/a-2',
          '10.1055/a-1',
          '10.1055/a-3',
        ]);
      });

      it('moves the other language up into the first five results', async () => {
        const german = Array.from({ length: 6 }, (_, index) => `10.1055/de-${String(index)}`);
        await store.upsert(
          german.map((doi) => ({
            article: anArticle().withDoi(doi).withLanguage('de').build(),
            chunks: [],
          })),
          signal,
        );
        /** Every German article matches by word and by meaning, the English one by meaning. */
        const germanHits = hits(...german.map((doi): [string, number] => [doi, 0.9]));
        const search: ArticleSearch = {
          lexical: () => Promise.resolve(germanHits),
          vector: ({ filters }) =>
            Promise.resolve(byLane(filters) === 'de' ? germanHits : hits(['10.1055/a-1', 0.88])),
        };
        const order = async (limit: number) =>
          (await service({ search }).search(request('Vorhofflimmern', { limit }), signal)).hits.map(
            ({ article }) => article.doi,
          );
        expect(await order(10)).toEqual([...german.slice(0, 4), '10.1055/a-1', ...german.slice(4)]);
      });

      it('gives a word-only match the lane of its passage language', async () => {
        const english = Array.from({ length: 6 }, (_, index) => `10.1055/en-${String(index)}`);
        await store.upsert(
          english.map((doi) => ({
            article: anArticle().withDoi(doi).build(),
            chunks: [
              aChunk()
                .of(doi as Doi)
                .withLanguage('en')
                .withModelVersion(embedder.modelVersion)
                .build(),
            ],
          })),
          signal,
        );
        /**
         * Five English articles match by word only, a sixth by meaning in the window too; the
         * German one is related in meaning but ranks tenth in its lane, below the window.
         */
        const unrelated = Array.from({ length: 9 }, (_, index): [string, number] => [
          `10.1055/x-${String(index)}`,
          0.5,
        ]);
        const search: ArticleSearch = {
          lexical: () =>
            Promise.resolve(hits(...english.slice(0, 5).map((doi): [string, number] => [doi, 0]))),
          vector: ({ filters }) =>
            Promise.resolve(
              filters.language === 'de'
                ? hits(...unrelated, ['10.1055/a-2', 0.86])
                : hits(['10.1055/x-9', 0.5], ['10.1055/x-10', 0.5], [english[5] ?? '', 0.88]),
            ),
        };
        const { hits: found } = await service({ search }).search(
          request('anticoagulation', { limit: 10 }),
          signal,
        );
        expect(found.map(({ article }) => article.doi).indexOf('10.1055/a-2' as Doi)).toBe(4);
      });

      it('leaves out vector hits far less similar than the best one', async () => {
        const search = laneSearch({
          de: hits(['10.1055/a-2', 0.9]),
          other: hits(['10.1055/a-1', 0.86], ['10.1055/a-3', 0.84]),
        });
        const { hits: found } = await service({ search }).search(request('Vorhofflimmern'), signal);
        expect(found.map(({ article }) => article.doi)).toEqual(['10.1055/a-2', '10.1055/a-1']);
      });
    });

    it('returns an empty page, not an error, when nothing matches', async () => {
      const result = await service().search(
        request('rivaroxaban', { filters: { yearFrom: 1990, yearTo: 1991 } }),
        signal,
      );
      expect(result).toEqual({ hits: [], indexVersion: 'v1' });
    });

    it('embeds a repeated query once', async () => {
      const embedQuery = vi.fn<typeof embedder.embedQuery>((text, s) =>
        embedder.embedQuery(text, s),
      );
      const search = service({ embedder: { embedQuery } });
      await search.search(request('stroke'), signal);
      await search.search(request('stroke'), signal);
      expect(embedQuery).toHaveBeenCalledTimes(1);
      expect(logs.at(-1)?.fields).toMatchObject({ embeddingCached: true });
    });
  });

  describe('DOI queries', () => {
    it('looks a DOI up directly', async () => {
      const { hits } = await service().search(request('https://doi.org/10.1055/A-3'), signal);
      expect(hits).toHaveLength(1);
      const { article, ...hit } = hits[0] ?? { article: undefined };
      expect(article?.doi).toBe('10.1055/a-3');
      expect(hit).toEqual({
        teaser: 'Stroke was rare after hip replacement.',
        whyMatched: 'Matched by DOI',
      });
    });

    it('finds nothing for an unknown DOI', async () => {
      expect(await dois('10.1055/a-404')).toEqual([]);
    });

    it('hides a retracted article unless retracted ones are asked for', async () => {
      expect(await dois('10.1055/a-4')).toEqual([]);
      expect(await dois('10.1055/a-4', { includeRetracted: true })).toEqual(['10.1055/a-4']);
    });
  });

  describe('paging', () => {
    it('pages through results with a cursor until the last page', async () => {
      const search = service();
      const first = await search.search(request('elderly patients', { limit: 1 }), signal);
      expect(first.hits).toHaveLength(1);
      expect(first.nextCursor).toEqual(expect.any(String));
      const second = await search.search(
        request('elderly patients', {
          limit: 1,
          ...(first.nextCursor && { cursor: first.nextCursor }),
        }),
        signal,
      );
      const seen = [...first.hits, ...second.hits].map(({ article }) => article.doi);
      expect(new Set(seen).size).toBe(seen.length);
      expect(second.nextCursor).toBeUndefined();
    });

    it('is CURSOR_STALE when the index was swapped between pages', async () => {
      const first = await service().search(request('elderly patients', { limit: 1 }), signal);
      const meta = await store.indexMeta(signal);
      if (meta === undefined || first.nextCursor === undefined) throw new Error('setup');
      await store.writeIndexMeta({ ...meta, version: 'v2' }, signal);
      expect(
        await codeOf(
          service().search(request('elderly patients', { cursor: first.nextCursor }), signal),
        ),
      ).toEqual({ code: 'CURSOR_STALE', field: undefined });
    });
  });

  describe('invalid requests and failures', () => {
    it.each([
      [request('  '), 'query'],
      [request('x', { filters: { yearFrom: 2025, yearTo: 2024 } }), 'yearFrom'],
      [request('x', { limit: 0 }), 'limit'],
      [request('x', { limit: 11 }), 'limit'],
      [request('x', { cursor: 'not-a-cursor' }), 'cursor'],
    ])('rejects %o as INVALID_INPUT on %s', async (bad, field) => {
      expect(await codeOf(service().search(bad, signal))).toEqual({ code: 'INVALID_INPUT', field });
    });

    it('is INDEX_UNAVAILABLE when no index has been built', async () => {
      const empty = createInMemoryArticleStore();
      expect(
        await codeOf(service({ reader: empty, search: empty }).search(request('stroke'), signal)),
      ).toEqual({ code: 'INDEX_UNAVAILABLE', field: undefined });
    });

    it('is TIMEOUT when a search runs over its budget', async () => {
      const stuck = () => new Promise<never>(() => undefined);
      const slow = service({
        search: { lexical: stuck, vector: stuck },
        options: { budgetMs: 20 },
      });
      expect(await codeOf(slow.search(request('stroke'), signal))).toEqual({
        code: 'TIMEOUT',
        field: undefined,
      });
      expect(logs.at(-1)).toMatchObject({
        level: 'warn',
        fields: { code: 'TIMEOUT' },
        message: 'search failed',
      });
    });
  });

  it('never logs the query text', async () => {
    const search = service();
    await search.search(request('Vorhofflimmern rivaroxaban'), signal);
    await search.search(request(''), signal).catch(() => undefined);
    const logged = JSON.stringify(logs).toLowerCase();
    expect(logs).toHaveLength(2);
    expect(logged).not.toContain('vorhofflimmern');
    expect(logged).not.toContain('rivaroxaban');
  });

  it('answers any string with results or INVALID_INPUT, never another error', async () => {
    const search = service();
    await fc.assert(
      fc.asyncProperty(fc.string({ unit: 'binary', maxLength: 600 }), async (query) => {
        const outcome = await search.search(request(query), signal).then(
          (result) => result.hits.length <= 5,
          (error: unknown) => isAppError(error) && error.code === 'INVALID_INPUT',
        );
        expect(outcome).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
