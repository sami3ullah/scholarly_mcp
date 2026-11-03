import { describe, expect, it } from 'vitest';
import type { Article } from '../article/article.js';
import type { Doi } from '../article/doi.js';
import type { Chunk } from '../chunk/chunk.js';
import type { ArticleReader } from '../ports/article-reader.js';
import type { ArticleSearch, RankedChunk } from '../ports/article-search.js';
import { sampleQueryChecks } from './verify-report.js';

const signal = new AbortController().signal;
const doi = '10.1055/a-1' as Doi;
const chunk = { id: `${doi}#0`, doi, embedding: new Float32Array([1]) } as Chunk;
const hit: RankedChunk = { chunkId: chunk.id, doi, rank: 1 };

const reader = {
  findByDoi: () => Promise.resolve({ doi, title: 'Stroke prevention' } as Article),
  findArticleChunks: () => Promise.resolve([chunk]),
} as unknown as ArticleReader;

const checksWith = (search: ArticleSearch) =>
  sampleQueryChecks({ reader, search }, [doi], signal).then((checks) =>
    Object.fromEntries(checks.map((check) => [check.name, check.ok])),
  );

describe('sampleQueryChecks', () => {
  it('passes a sample found by its title words and by its own vector', async () => {
    const search = { lexical: () => Promise.resolve([hit]), vector: () => Promise.resolve([hit]) };
    expect(await checksWith(search)).toEqual({
      [`title finds ${doi}`]: true,
      [`vector finds ${chunk.id}`]: true,
    });
  });

  it('fails each side that misses the sample', async () => {
    const search = { lexical: () => Promise.resolve([]), vector: () => Promise.resolve([]) };
    expect(await checksWith(search)).toEqual({
      [`title finds ${doi}`]: false,
      [`vector finds ${chunk.id}`]: false,
    });
  });
});
