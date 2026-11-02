import {
  appError,
  type Article,
  type ArticleReader,
  type ArticleSearch,
  type ArticleWriter,
  type Chunk,
  type Doi,
  type IndexMeta,
  type RankedChunk,
} from '@scholarly-mcp/core';
import { matchesFilters } from './matches-filters.js';
import { settle } from './settle.js';

/** A store that does everything a real one does, in maps, for tests. */
export type InMemoryArticleStore = ArticleReader & ArticleWriter & ArticleSearch;

interface Entry {
  readonly article: Article;
  readonly chunks: readonly Chunk[];
}

/**
 * Creates an empty in-memory store. Lexical search is case-insensitive substring matching
 * over each chunk's text and its article's title, and vector search is exact cosine, which is enough to exercise callers and contracts.
 */
export function createInMemoryArticleStore(): InMemoryArticleStore {
  const entries = new Map<Doi, Entry>();
  let meta: IndexMeta | undefined;

  const allChunks = () => [...entries.values()].flatMap((entry) => entry.chunks);
  const modelVersion = () => allChunks()[0]?.modelVersion;

  function rank(
    scored: { chunk: Chunk; score: number }[],
    filters: Parameters<typeof matchesFilters>[2],
    limit: number,
  ): RankedChunk[] {
    return scored
      .filter(({ chunk, score }) => {
        const entry = entries.get(chunk.doi);
        return score > 0 && entry !== undefined && matchesFilters(entry.article, chunk, filters);
      })
      .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
      .slice(0, limit)
      .map(({ chunk }, index) => ({ chunkId: chunk.id, doi: chunk.doi, rank: index + 1 }));
  }

  function checkUpsert(records: Parameters<ArticleWriter['upsert']>[0]): void {
    const expected = modelVersion() ?? records[0]?.chunks[0]?.modelVersion;
    for (const { article, chunks } of records) {
      for (const chunk of chunks) {
        if (chunk.doi !== article.doi) {
          throw appError('INVALID_INPUT', `Chunk ${chunk.id} does not belong to ${article.doi}`);
        }
        if (chunk.modelVersion !== expected) {
          throw appError('INVALID_INPUT', 'Refusing to mix embedding model versions');
        }
      }
    }
  }

  return {
    findByDoi: (doi, signal) => settle(signal, () => entries.get(doi)?.article),
    findManyByDoi: (dois, signal) =>
      settle(signal, () => dois.flatMap((doi) => entries.get(doi)?.article ?? [])),
    findChunks: (ids, signal) =>
      settle(signal, () => {
        const byId = new Map(allChunks().map((chunk) => [chunk.id, chunk]));
        return ids.flatMap((id) => byId.get(id) ?? []);
      }),
    indexMeta: (signal) => settle(signal, () => meta),
    upsert: (records, signal) =>
      settle(signal, () => {
        checkUpsert(records);
        for (const record of records) entries.set(record.article.doi, record);
      }),
    remove: (doi, signal) =>
      settle(signal, () => {
        entries.delete(doi);
      }),
    contentHashOf: (doi, signal) => settle(signal, () => entries.get(doi)?.article.contentHash),
    writeIndexMeta: (next, signal) =>
      settle(signal, () => {
        meta = next;
      }),
    lexical: ({ terms, filters, limit }, signal) =>
      settle(signal, () => {
        const needles = terms.map((term) => term.toLowerCase()).filter((term) => term !== '');
        const scored = allChunks().map((chunk) => {
          const title = entries.get(chunk.doi)?.article.title ?? '';
          const text = `${title} ${chunk.text}`.toLowerCase();
          return { chunk, score: needles.filter((needle) => text.includes(needle)).length };
        });
        return rank(scored, filters, limit);
      }),
    vector: ({ embedding, filters, limit }, signal) =>
      settle(signal, () => {
        const scored = allChunks().map((chunk) => ({
          chunk,
          score: cosine(embedding, chunk.embedding),
        }));
        return rank(scored, filters, limit);
      }),
  };
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}
