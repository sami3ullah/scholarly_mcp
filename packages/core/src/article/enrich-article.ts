import type { Enrichment } from '../ports/article-enricher.js';
import type { Article } from './article.js';
import { hashArticleContent, type ArticleContent } from './hash-article-content.js';
import type { Subject } from './subject.js';

/**
 * Returns the article with an enricher's subjects added and its full-text reference set
 * (or cleared, when `enrichment` has none), with the content hash recomputed. The hash then
 * covers the subjects and the reference, so a changed reference re-indexes the article and
 * an unchanged one lets a rebuild reuse its chunks.
 */
export async function enrichArticle(
  article: Article,
  enrichment: Enrichment | undefined,
): Promise<Article> {
  const enriched: Article = {
    ...withoutFullTextRef(article),
    subjects: mergeSubjects(article.subjects, enrichment?.subjects ?? []),
    ...(enrichment?.fullText !== undefined && { fullText: enrichment.fullText }),
  };
  return rehash(enriched);
}

/** The article without its full-text reference, rehashed: for when the text proved unusable. */
export async function withoutFullText(article: Article): Promise<Article> {
  return rehash(withoutFullTextRef(article));
}

function withoutFullTextRef(article: Article): Article {
  const copy = { ...article };
  delete copy.fullText;
  return copy;
}

async function rehash(article: Article): Promise<Article> {
  const content: Partial<Article> = { ...article };
  delete content.contentHash;
  delete content.sourceUpdatedAt;
  delete content.ingestedAt;
  return { ...article, contentHash: await hashArticleContent(content as ArticleContent) };
}

/** Keeps existing subjects first; a label repeats only under another origin. */
function mergeSubjects(existing: readonly Subject[], added: readonly Subject[]): Subject[] {
  const seen = new Set<string>();
  return [...existing, ...added].filter((subject) => {
    const key = `${subject.origin}:${subject.label.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
