import { normalizeDoi, type Article, type Doi } from '@scholarly-mcp/core';
import { cleanJatsInline } from './jats/clean-jats.js';
import { classifyWork } from './work/classify-work.js';
import type { CrossrefWork } from './work/crossref-work.js';
import { mapWork, type SkipReason } from './work/map-work.js';

/** DOIs per follow-up lookup, keeping the URL well under common length limits. */
export const LOOKUP_BATCH = 20;

/** Fetches the works for specific DOIs, within the source's scope. */
export type LookupWorks = (dois: readonly Doi[]) => Promise<readonly CrossrefWork[]>;

/** The articles of one page, and counts of what was skipped and why. */
export interface PageArticles {
  readonly articles: readonly Article[];
  readonly skipped: Readonly<Partial<Record<SkipReason, number>>>;
  /** Articles fetched because a notice on this page retracts them. */
  readonly followedUp: number;
}

/**
 * Maps one page of works to articles. First it collects what the page's retraction notices
 * retract, then maps every work, marking those targets retracted and dating their change to
 * the notice. Targets not on the page are looked up and emitted too, so a retraction reaches
 * the index even when the original record was not re-deposited.
 */
export async function pageArticles(
  works: readonly CrossrefWork[],
  now: Date,
  lookup: LookupWorks,
): Promise<PageArticles> {
  const noticeDates = retractionNotices(works);
  const articles = new Map<Doi, Article>();
  const skipped: Partial<Record<SkipReason, number>> = {};

  const emit = async (work: CrossrefWork) => {
    const updatedAt = noticeDates.get(normalizeDoi(work.DOI) ?? ('' as Doi));
    const mapped = await mapWork(work, {
      now,
      ...(updatedAt && { knownRetracted: true, updatedAt }),
    });
    if (mapped.kind === 'article') articles.set(mapped.article.doi, mapped.article);
    else skipped[mapped.reason] = (skipped[mapped.reason] ?? 0) + 1;
  };

  for (const work of works) await emit(work);
  const onPage = new Set(works.map((work) => normalizeDoi(work.DOI)));
  const missing = [...noticeDates.keys()].filter((doi) => !onPage.has(doi));
  let followedUp = 0;
  for (let start = 0; start < missing.length; start += LOOKUP_BATCH) {
    for (const work of await lookup(missing.slice(start, start + LOOKUP_BATCH))) {
      const doi = normalizeDoi(work.DOI);
      if (doi === undefined || !noticeDates.has(doi) || articles.has(doi)) continue;
      await emit(work);
      followedUp += 1;
    }
  }
  return { articles: [...articles.values()], skipped, followedUp };
}

/** Maps each DOI a notice on the page retracts to the latest such notice's deposit date. */
function retractionNotices(works: readonly CrossrefWork[]): Map<Doi, Date> {
  const dates = new Map<Doi, Date>();
  for (const work of works) {
    const deposited = new Date(work.deposited['date-time']);
    for (const doi of classifyWork(work, cleanJatsInline(work.title?.[0] ?? '')).retracts) {
      const known = dates.get(doi);
      if (known === undefined || deposited > known) dates.set(doi, deposited);
    }
  }
  return dates;
}
