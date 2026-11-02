import type { Article } from '../article/article.js';
import type { Doi } from '../article/doi.js';
import type { FullTextRef } from '../article/full-text-ref.js';
import type { Subject } from '../article/subject.js';
import type { FullTextSection } from '../chunk/full-text-section.js';

/** What an enricher knows about one article, found by its DOI. */
export interface Enrichment {
  /** Short subject labels with their origin (ADR 0004). */
  readonly subjects: readonly Subject[];
  /**
   * Present only when the full text may be indexed: open access under an allowlisted
   * version-of-record licence, and the copy is the version of record (ADR 0003).
   */
  readonly fullText?: FullTextRef;
}

/**
 * Adds to articles another source emitted, matched on DOI only, such as Europe PMC
 * subjects and open access full text. It never emits articles itself.
 */
export interface ArticleEnricher {
  /** Stable name, also the chunk source of its full text, e.g. `europepmc`. */
  readonly name: string;
  /** Looks the articles up; an article with no match is absent from the result. */
  lookup(articles: readonly Article[], signal: AbortSignal): Promise<ReadonlyMap<Doi, Enrichment>>;
  /**
   * The full text's sections, for matching only. Undefined when the text is missing, is
   * another version than the reference, or is reserved from text and data mining.
   */
  fetchFullText(
    doi: Doi,
    ref: FullTextRef,
    signal: AbortSignal,
  ): Promise<readonly FullTextSection[] | undefined>;
}
