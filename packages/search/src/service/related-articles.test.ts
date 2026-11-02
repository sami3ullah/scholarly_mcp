import { doiSchema, isAppError, type Article } from '@scholarly-mcp/core';
import {
  aChunk,
  anArticle,
  createFakeClock,
  createInMemoryArticleStore,
  createTestLogger,
  type CapturedLine,
  type InMemoryArticleStore,
} from '@scholarly-mcp/testkit';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSearchService } from './create-search-service.js';

const signal = new AbortController().signal;
const doi = (value: string) => doiSchema.parse(value);

/** Articles whose chunk vectors point at chosen angles, so nearness is easy to reason about. */
function record(article: Article, ...vectors: number[][]) {
  return {
    article,
    chunks: vectors.map((vector, ordinal) =>
      aChunk()
        .of(article.doi, ordinal)
        .inSection(ordinal === 0 ? 'Results' : 'Conclusion')
        .withEmbedding(...vector)
        .build(),
    ),
  };
}

describe('related', () => {
  let store: InMemoryArticleStore;
  let logs: CapturedLine[];
  const service = () =>
    createSearchService({
      reader: store,
      search: store,
      embedder: { embedQuery: () => Promise.reject(new Error('not used')) },
      clock: createFakeClock(),
      logger: createTestLogger(logs),
    });
  const related = (value: string, limit = 5) =>
    service().related({ doi: doi(value), limit }, signal);

  beforeEach(async () => {
    logs = [];
    store = createInMemoryArticleStore();
    await store.upsert(
      [
        // Its mean vector points between the two axes.
        record(anArticle().withDoi('10.1055/a-1').build(), [1, 0], [0, 1]),
        record(anArticle().withDoi('10.1055/a-2').build(), [1, 1]),
        record(anArticle().withDoi('10.1055/a-3').build(), [1, 0.2]),
        record(anArticle().withDoi('10.1055/a-4').retracted().build(), [1, 1]),
        record(anArticle().withDoi('10.1055/a-5').build(), [0, 0, 1]),
      ],
      signal,
    );
    await store.writeIndexMeta(
      {
        version: 'v1',
        modelVersion: 'multilingual-e5-small@test',
        articleCount: 5,
        chunkCount: 6,
        builtAt: new Date('2026-11-02T10:00:00Z'),
      },
      signal,
    );
  });

  it("ranks neighbours of the article's mean vector, leaving out the article itself", async () => {
    const result = await related('10.1055/a-1');
    expect(result.article.doi).toBe('10.1055/a-1');
    expect(result.hits.map(({ article }) => article.doi)).toEqual(['10.1055/a-2', '10.1055/a-3']);
    expect(result.indexVersion).toBe('v1');
  });

  it('leaves out retracted articles and those unrelated in meaning', async () => {
    const dois = (await related('10.1055/a-2')).hits.map(({ article }) => article.doi);
    expect(dois).not.toContain('10.1055/a-4');
    expect(dois).not.toContain('10.1055/a-5');
  });

  it('labels each hit as related in meaning, with a teaser from its abstract', async () => {
    const [hit] = (await related('10.1055/a-1')).hits;
    expect(hit).toMatchObject({
      matchedChunkId: '10.1055/a-2#0',
      whyMatched: 'Related in meaning (Results)',
      teaser: 'Background: Dosing matters.',
    });
  });

  it('returns at most the limit', async () => {
    expect((await related('10.1055/a-1', 1)).hits).toHaveLength(1);
  });

  it('still answers for a retracted article named directly', async () => {
    expect((await related('10.1055/a-4')).hits.length).toBeGreaterThan(0);
  });

  it('fails with NOT_FOUND on doi for an unknown DOI, and logs it without the DOI', async () => {
    const error: unknown = await related('10.1055/unknown').catch((caught: unknown) => caught);
    expect(isAppError(error) && { code: error.code, field: error.field }).toEqual({
      code: 'NOT_FOUND',
      field: 'doi',
    });
    expect(logs.at(-1)).toMatchObject({ message: 'related failed', fields: { code: 'NOT_FOUND' } });
    expect(JSON.stringify(logs)).not.toContain('10.1055/unknown');
  });

  it('rejects a limit outside 1 to 10 as INVALID_INPUT on limit', async () => {
    const error: unknown = await related('10.1055/a-1', 11).catch((caught: unknown) => caught);
    expect(isAppError(error) && error.field).toBe('limit');
  });

  it('is INDEX_UNAVAILABLE before an index has been built', async () => {
    store = createInMemoryArticleStore();
    const error: unknown = await related('10.1055/a-1').catch((caught: unknown) => caught);
    expect(isAppError(error) && error.code).toBe('INDEX_UNAVAILABLE');
  });

  it('logs the result count of a completed call', async () => {
    await related('10.1055/a-1');
    expect(logs.at(-1)).toMatchObject({ message: 'related completed', fields: { results: 2 } });
  });
});
