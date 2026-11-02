import type { Article, Chunk } from '@scholarly-mcp/core';
import {
  aChunk,
  anArticle,
  createFakeClock,
  createFakeEmbedder,
  createInMemoryArticleStore,
  createTestLogger,
  type CapturedLine,
} from '@scholarly-mcp/testkit';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createSearchService } from './create-search-service.js';

const signal = new AbortController().signal;
const embedder = createFakeEmbedder();
const CC_BY_NC_ND = 'https://creativecommons.org/licenses/by-nc-nd/4.0/';

/**
 * ADR 0003 guardrail 1: full-text chunks are used for matching only. Whatever a full-text
 * chunk says, a search result (teaser, whyMatched, article record) and the search log
 * carry none of its words beyond the query's own terms; whyMatched names only the section.
 */
async function indexWith(
  article: Article,
  fullText: string,
): Promise<{
  readonly search: (query: string) => Promise<string>;
  readonly logs: CapturedLine[];
}> {
  const store = createInMemoryArticleStore();
  const [vector] = await embedder.embedPassages([`${article.title} ${fullText}`], signal);
  const [titleVector] = await embedder.embedPassages([article.title], signal);
  const chunks: Chunk[] = [
    aChunk()
      .of(article.doi, 0)
      .withText(article.title)
      .withEmbedding(...(titleVector ?? []))
      .withModelVersion(embedder.modelVersion)
      .build(),
    aChunk()
      .of(article.doi, 1)
      .withText(fullText)
      .inSection('Methods')
      .withEmbedding(...(vector ?? []))
      .withModelVersion(embedder.modelVersion)
      .fromFullText(CC_BY_NC_ND)
      .build(),
  ];
  await store.upsert([{ article, chunks }], signal);
  await store.writeIndexMeta(
    {
      version: 'v1',
      modelVersion: embedder.modelVersion,
      articleCount: 1,
      chunkCount: 2,
      builtAt: new Date('2026-11-02T00:00:00Z'),
    },
    signal,
  );
  const logs: CapturedLine[] = [];
  const service = createSearchService({
    reader: store,
    search: store,
    embedder,
    clock: createFakeClock(),
    logger: createTestLogger(logs),
  });
  return {
    search: async (query) =>
      JSON.stringify(await service.search({ query, filters: {}, limit: 5 }, signal)),
    logs,
  };
}

const openArticle = (abstract?: string) => {
  const builder = anArticle()
    .withDoi('10.1055/a-9')
    .withTitle('Carotid revascularisation outcomes')
    .openAccess();
  const article =
    abstract === undefined ? builder.withoutAbstract() : builder.withAbstract(abstract);
  return {
    ...article.build(),
    fullText: { source: 'europepmc', id: 'PMC9', licenseUrl: CC_BY_NC_ND, revision: '1' },
  } satisfies Article;
};

describe('full text is for matching only', () => {
  it('finds an article by its full text and explains it by section and query terms', async () => {
    const { search, logs } = await indexWith(
      openArticle(),
      'Zylotrexate was given to 412 patients before trilaminar endarterectomy.',
    );
    const result = JSON.parse(await search('trilaminar endarterectomy')) as {
      hits: { whyMatched: string; teaser: string }[];
    };
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.whyMatched).toBe(
      'Matched in Methods (full text): trilaminar, endarterectomy',
    );
    expect(result.hits[0]?.teaser).toBe('');
    const shown = JSON.stringify(result) + JSON.stringify(logs);
    expect(shown).not.toMatch(/Zylotrexate|412 patients/);
  });

  it('builds the teaser from the abstract, never from the full text', async () => {
    const { search } = await indexWith(
      openArticle('Conclusion: Stenting was as safe as surgery.'),
      'Zylotrexate was given before trilaminar endarterectomy.',
    );
    const shown = await search('trilaminar endarterectomy');
    expect(shown).toContain('Stenting was as safe as surgery.');
    expect(shown).not.toContain('Zylotrexate');
  });

  it('never shows a full-text word that is not a query term', async () => {
    const word = fc.stringMatching(/^[a-z]{7,12}$/);
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(word, { minLength: 4, maxLength: 12 }),
        fc.nat(),
        async (words, pick) => {
          const queryWord = words[pick % words.length] ?? '';
          const { search, logs } = await indexWith(openArticle(), `${words.join(' ')}.`);
          const shown = (await search(queryWord)) + JSON.stringify(logs);
          // A word inside the typed term ("ototype" in "ototypeaaa") is shown as the query's own.
          for (const other of words.filter((candidate) => !queryWord.includes(candidate))) {
            expect(shown).not.toContain(other);
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});
