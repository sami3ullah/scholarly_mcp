import { publishedDateSchema, type PublishedDate } from '@scholarly-mcp/core';
import type { CrossrefWork } from './crossref-work.js';

/**
 * The publication date from Crossref's `published` (earliest of print and online), falling
 * back to `issued`. Keeps only the parts Crossref gave; an impossible day or month is
 * dropped rather than corrected, so the date degrades to a coarser precision.
 */
export function mapPublishedDate(work: CrossrefWork): PublishedDate | undefined {
  const parts = (work.published ?? work.issued)?.['date-parts'][0] ?? [];
  const [year, month, day] = parts;
  const candidates = [{ year, month, day }, { year, month }, { year }].map((candidate) =>
    Object.fromEntries(Object.entries(candidate).filter(([, value]) => typeof value === 'number')),
  );
  for (const candidate of candidates) {
    const parsed = publishedDateSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}
