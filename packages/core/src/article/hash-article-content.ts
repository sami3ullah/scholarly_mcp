import type { Article } from './article.js';

/** The fields that make up an article's content; bookkeeping fields are left out. */
export type ArticleContent = Omit<Article, 'contentHash' | 'sourceUpdatedAt' | 'ingestedAt'>;

/**
 * Returns a hex SHA-256 digest of an article's content. Keys are sorted and dates written as
 * ISO strings, so the same content always hashes the same, whatever the property order. A
 * re-fetched record with an unchanged hash can skip re-embedding.
 */
export async function hashArticleContent(content: ArticleContent): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(content));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, field: unknown) => {
    if (field === null || typeof field !== 'object' || Array.isArray(field)) return field;
    return Object.fromEntries(
      Object.entries(field).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
  });
}
