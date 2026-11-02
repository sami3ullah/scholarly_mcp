import { appError, type Article, type Source } from '@scholarly-mcp/core';
import { settle } from './settle.js';

/** Options for {@link createInMemorySource}. */
export interface InMemorySourceOptions {
  readonly articles: readonly Article[];
  readonly name?: string;
  readonly pageSize?: number;
}

/** A source that pages over a fixed list, with the offset as its cursor. */
export function createInMemorySource(options: InMemorySourceOptions): Source {
  const { articles, name = 'memory', pageSize = 2 } = options;
  return {
    name,
    fetchPage: ({ cursor, updatedSince }, signal) =>
      settle(signal, () => {
        const offset = cursor === undefined ? 0 : Number(cursor);
        if (!Number.isInteger(offset) || offset < 0) {
          throw appError('INVALID_INPUT', `Unknown cursor for source ${name}`);
        }
        const matching = articles.filter(
          (article) => updatedSince === undefined || article.sourceUpdatedAt >= updatedSince,
        );
        const end = offset + pageSize;
        return {
          articles: matching.slice(offset, end),
          ...(end < matching.length && { nextCursor: String(end) }),
        };
      }),
  };
}
