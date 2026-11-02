import type { Article } from '../article/article.js';
import type { ChunkSource } from './chunk.js';
import type { ChunkSection } from './chunk-document.js';
import { parseAbstract } from './parse-abstract.js';

/**
 * The sections a metadata record contributes to the index: its abstract sections, or, for
 * the many articles without an abstract, one metadata section holding the title and
 * subtitle, so the article can still be found.
 */
export function articleSections(
  article: Pick<Article, 'title' | 'subtitle' | 'abstract'>,
  source: ChunkSource,
): ChunkSection[] {
  const sections = article.abstract === undefined ? [] : parseAbstract(article.abstract);
  if (sections.length > 0) {
    return sections.map((section) => ({ ...section, origin: 'abstract', source }));
  }
  const heading =
    article.subtitle === undefined ? article.title : `${article.title}: ${article.subtitle}`;
  return [{ paragraphs: [heading], origin: 'metadata', source }];
}
