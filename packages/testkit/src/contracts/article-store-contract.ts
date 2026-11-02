import {
  isAppError,
  type ArticleReader,
  type ArticleSearch,
  type ArticleWriter,
  type Doi,
  type SearchFilters,
} from '@scholarly-mcp/core';
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { aChunk } from '../builders/a-chunk.js';
import { anArticle } from '../builders/an-article.js';

/** The three faces of a store. Real adapters may back them with separate connections. */
export interface ArticleStoreUnderTest {
  readonly reader: ArticleReader;
  readonly writer: ArticleWriter;
  readonly search: ArticleSearch;
}

const signal = new AbortController().signal;
const DOI_A = '10.1055/a-0000-000a' as Doi;
const DOI_B = '10.1055/a-0000-000b' as Doi;
const DOI_C = '10.1055/a-0000-000c' as Doi;

const recordOf = (doi: Doi, article = anArticle().withDoi(doi), chunkCount = 2) => ({
  article: article.build(),
  chunks: Array.from({ length: chunkCount }, (_, ordinal) => aChunk().of(doi, ordinal).build()),
});

/**
 * The behaviour every article store must share (Liskov, PLAN.md "Testing strategy"). Run it
 * from each adapter's tests with a factory that returns a fresh, empty store.
 */
export function runArticleStoreContract(
  name: string,
  create: () => ArticleStoreUnderTest | Promise<ArticleStoreUnderTest>,
): void {
  describe(`${name} satisfies the article store contract`, () => {
    let store: ArticleStoreUnderTest;
    beforeEach(async () => {
      store = await create();
    });

    describe('reading and writing', () => {
      it('returns undefined for an unknown DOI', async () => {
        expect(await store.reader.findByDoi(DOI_A, signal)).toBeUndefined();
      });

      it('returns an upserted article unchanged', async () => {
        const record = recordOf(DOI_A);
        await store.writer.upsert([record], signal);
        expect(await store.reader.findByDoi(DOI_A, signal)).toEqual(record.article);
      });

      it('leaves the index unchanged when the same records are written twice', async () => {
        const records = [recordOf(DOI_A), recordOf(DOI_B)];
        await store.writer.upsert(records, signal);
        await store.writer.upsert(records, signal);
        expect(await store.reader.findManyByDoi([DOI_A, DOI_B], signal)).toHaveLength(2);
        expect(await store.reader.findChunks([`${DOI_A}#0`, `${DOI_A}#1`], signal)).toHaveLength(2);
      });

      it('replaces all chunks of an article on upsert', async () => {
        await store.writer.upsert([recordOf(DOI_A, anArticle().withDoi(DOI_A), 3)], signal);
        await store.writer.upsert([recordOf(DOI_A, anArticle().withDoi(DOI_A), 1)], signal);
        const ids = [`${DOI_A}#0`, `${DOI_A}#1`, `${DOI_A}#2`];
        expect((await store.reader.findChunks(ids, signal)).map((chunk) => chunk.id)).toEqual([
          `${DOI_A}#0`,
        ]);
      });

      it('returns articles in the order asked and skips unknown DOIs', async () => {
        await store.writer.upsert([recordOf(DOI_A), recordOf(DOI_B)], signal);
        const found = await store.reader.findManyByDoi([DOI_B, DOI_C, DOI_A], signal);
        expect(found.map((article) => article.doi)).toEqual([DOI_B, DOI_A]);
      });

      it('returns chunks in the order asked, embeddings intact', async () => {
        const record = recordOf(DOI_A);
        await store.writer.upsert([record], signal);
        const found = await store.reader.findChunks(
          [`${DOI_A}#1`, 'unknown', `${DOI_A}#0`],
          signal,
        );
        expect(found).toEqual([record.chunks[1], record.chunks[0]]);
      });

      it('removes an article with its chunks, and ignores unknown DOIs', async () => {
        await store.writer.upsert([recordOf(DOI_A)], signal);
        await store.writer.remove(DOI_A, signal);
        await store.writer.remove(DOI_B, signal);
        expect(await store.reader.findByDoi(DOI_A, signal)).toBeUndefined();
        expect(await store.reader.findChunks([`${DOI_A}#0`], signal)).toEqual([]);
      });

      it('reports the stored content hash so unchanged records skip re-embedding', async () => {
        const hash = 'f'.repeat(64);
        await store.writer.upsert(
          [recordOf(DOI_A, anArticle().withDoi(DOI_A).withContentHash(hash))],
          signal,
        );
        expect(await store.writer.contentHashOf(DOI_A, signal)).toBe(hash);
        expect(await store.writer.contentHashOf(DOI_B, signal)).toBeUndefined();
      });

      it('stores the index description', async () => {
        expect(await store.reader.indexMeta(signal)).toBeUndefined();
        const meta = {
          version: 'v1',
          modelVersion: 'multilingual-e5-small@test',
          articleCount: 1,
          chunkCount: 2,
          builtAt: new Date('2026-11-02T10:00:00Z'),
        };
        await store.writer.writeIndexMeta(meta, signal);
        expect(await store.reader.indexMeta(signal)).toEqual(meta);
      });

      it('refuses to mix embedding model versions and writes nothing', async () => {
        await store.writer.upsert([recordOf(DOI_A)], signal);
        const mixed = {
          article: anArticle().withDoi(DOI_B).build(),
          chunks: [aChunk().of(DOI_B).withModelVersion('bge-m3@1').build()],
        };
        const error: unknown = await store.writer.upsert([mixed], signal).catch((e: unknown) => e);
        expect(isAppError(error)).toBe(true);
        expect(await store.reader.findByDoi(DOI_B, signal)).toBeUndefined();
      });

      it('rejects when the caller has already aborted', async () => {
        const aborted = AbortSignal.abort();
        await expect(store.reader.findByDoi(DOI_A, aborted)).rejects.toThrow();
        await expect(store.writer.upsert([recordOf(DOI_A)], aborted)).rejects.toThrow();
      });
    });

    describe('searching', () => {
      const noFilters: SearchFilters = {};

      beforeEach(async () => {
        await store.writer.upsert(
          [
            {
              article: anArticle().withDoi(DOI_A).withTitle('Stroke prevention').build(),
              chunks: [
                aChunk()
                  .of(DOI_A)
                  .withText('Rivaroxaban in atrial fibrillation')
                  .withEmbedding(1, 0)
                  .build(),
              ],
            },
            {
              article: anArticle().withDoi(DOI_B).withTitle('Thromboprophylaxis').build(),
              chunks: [
                aChunk()
                  .of(DOI_B)
                  .withText('Apixaban after hip surgery')
                  .withEmbedding(0.6, 0.8)
                  .build(),
              ],
            },
          ],
          signal,
        );
      });

      it('finds chunks containing a term, ranked from 1', async () => {
        const hits = await store.search.lexical(
          { terms: ['rivaroxaban'], filters: noFilters, limit: 10 },
          signal,
        );
        expect(hits).toEqual([{ chunkId: `${DOI_A}#0`, doi: DOI_A, rank: 1 }]);
      });

      it('matches words of the article title in every chunk of it', async () => {
        const hits = await store.search.lexical(
          { terms: ['thromboprophylaxis'], filters: noFilters, limit: 10 },
          signal,
        );
        expect(hits).toEqual([{ chunkId: `${DOI_B}#0`, doi: DOI_B, rank: 1 }]);
      });

      it('returns no hits for no terms', async () => {
        expect(
          await store.search.lexical({ terms: [], filters: noFilters, limit: 10 }, signal),
        ).toEqual([]);
      });

      it.each([['"'], ['AND'], ['NEAR('], ['*'], ['-'], ["'; DROP TABLE chunks; --"], ['(']])(
        'treats %j as plain text, never as query syntax',
        async (term) => {
          await expect(
            store.search.lexical({ terms: [term], filters: noFilters, limit: 10 }, signal),
          ).resolves.toEqual(expect.any(Array));
        },
      );

      it('never fails on any string as a term, in any query language', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(fc.string({ unit: 'binary' }), { maxLength: 6 }),
            fc.constantFrom(undefined, 'de', 'en'),
            async (terms, language) => {
              const query = { terms, filters: noFilters, limit: 10 };
              const hits = await store.search.lexical(
                language === undefined ? query : { ...query, language },
                signal,
              );
              expect(hits.length).toBeLessThanOrEqual(10);
            },
          ),
          { numRuns: 300 },
        );
      });

      it('returns nearest chunks first, within the limit', async () => {
        const embedding = new Float32Array(384);
        embedding.set([1, 0]);
        const hits = await store.search.vector({ embedding, filters: noFilters, limit: 1 }, signal);
        expect(hits).toEqual([{ chunkId: `${DOI_A}#0`, doi: DOI_A, rank: 1 }]);
      });
    });

    describe('filters, applied the same on both sides', () => {
      const query = { terms: ['dabigatran'], embedding: unit() };
      const run = async (filters: SearchFilters) => {
        const lexical = await store.search.lexical(
          { terms: query.terms, filters, limit: 10 },
          signal,
        );
        const vector = await store.search.vector(
          { embedding: query.embedding, filters, limit: 10 },
          signal,
        );
        const dois = (hits: { doi: Doi }[]) => hits.map((hit) => hit.doi).sort();
        expect(dois(lexical)).toEqual(dois(vector));
        return dois(lexical);
      };

      beforeEach(async () => {
        const chunk = (doi: Doi, language = 'en') =>
          aChunk()
            .of(doi)
            .withText('Dabigatran trial')
            .withLanguage(language)
            .withEmbedding(1)
            .build();
        await store.writer.upsert(
          [
            {
              article: anArticle().withDoi(DOI_A).publishedIn(2023).openAccess().build(),
              chunks: [chunk(DOI_A)],
            },
            {
              article: anArticle()
                .withDoi(DOI_B)
                .publishedIn(2025)
                .inJournal('Der Nuklearmediziner', '0723-7065')
                .build(),
              chunks: [chunk(DOI_B, 'de')],
            },
            { article: anArticle().withDoi(DOI_C).retracted().build(), chunks: [chunk(DOI_C)] },
          ],
          signal,
        );
      });

      it.each<[string, SearchFilters, Doi[]]>([
        ['excludes retracted articles by default', {}, [DOI_A, DOI_B]],
        [
          'includes retracted articles on request',
          { includeRetracted: true },
          [DOI_A, DOI_B, DOI_C],
        ],
        ['keeps open access only', { openAccessOnly: true }, [DOI_A]],
        ['applies yearFrom', { yearFrom: 2024 }, [DOI_B]],
        ['applies yearTo', { yearTo: 2024 }, [DOI_A]],
        ['matches the journal by ISSN', { journalIssn: '0723-7065' }, [DOI_B]],
        ['matches the language', { language: 'de' }, [DOI_B]],
      ])('%s', async (_case, filters, expected) => {
        expect(await run(filters)).toEqual(expected);
      });
    });
  });
}

function unit(): Float32Array {
  const vector = new Float32Array(384);
  vector[0] = 1;
  return vector;
}
