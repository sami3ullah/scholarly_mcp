import type { Article } from '@scholarly-mcp/core';
import type { CrossrefWork } from './crossref-work.js';

/** Where an article sits in its journal, as far as the deposit says. */
export type IssueLocator = Pick<Article, 'volume' | 'issue' | 'pages'>;

/**
 * Reads volume, issue and pages from a Crossref work, as deposited (`S 01`, `e12-e20`, `CP`).
 * Whitespace is collapsed and blank values are left out, never invented.
 */
export function mapIssueLocator(work: CrossrefWork): IssueLocator {
  const volume = clean(work.volume);
  const issue = clean(work.issue);
  const pages = clean(work.page);
  return {
    ...(volume && { volume }),
    ...(issue && { issue }),
    ...(pages && { pages }),
  };
}

function clean(value: string | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}
