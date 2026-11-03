import type { LandingArticle } from '@scholarly-mcp/core';

/**
 * Formats a publication date with the precision the source gave, so a year-only date
 * reads "2024", never an invented "1 January 2024". UTC keeps the day from shifting.
 */
export function formatPublished(published: LandingArticle['published'], language: string) {
  const { year, month, day } = published;
  if (month === undefined) return String(year);
  const date = new Date(Date.UTC(year, month - 1, day ?? 1));
  return new Intl.DateTimeFormat(language, {
    year: 'numeric',
    month: 'long',
    ...(day !== undefined && { day: 'numeric' }),
    timeZone: 'UTC',
  }).format(date);
}
