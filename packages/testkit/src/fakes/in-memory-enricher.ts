import type { ArticleEnricher, Doi, Enrichment, FullTextSection } from '@scholarly-mcp/core';
import { settle } from './settle.js';

/** One article an {@link createInMemoryEnricher} knows. */
export interface EnricherEntry {
  readonly doi: Doi;
  readonly enrichment: Enrichment;
  /** The full text behind `enrichment.fullText`; absent means the text is missing. */
  readonly sections?: readonly FullTextSection[];
}

/** An enricher over fixed entries, matched by DOI. It counts full-text fetches. */
export function createInMemoryEnricher(
  entries: readonly EnricherEntry[],
): ArticleEnricher & { readonly fullTextFetches: () => number } {
  const byDoi = new Map(entries.map((entry) => [entry.doi, entry]));
  let fetches = 0;
  return {
    name: 'europepmc',
    lookup: (articles, signal) =>
      settle(signal, () => {
        const found = new Map<Doi, Enrichment>();
        for (const { doi } of articles) {
          const entry = byDoi.get(doi);
          if (entry !== undefined) found.set(doi, entry.enrichment);
        }
        return found;
      }),
    fetchFullText: (doi, ref, signal) =>
      settle(signal, () => {
        fetches += 1;
        const entry = byDoi.get(doi);
        const known = entry?.enrichment.fullText;
        return known?.id === ref.id && known.revision === ref.revision
          ? entry?.sections
          : undefined;
      }),
    fullTextFetches: () => fetches,
  };
}
