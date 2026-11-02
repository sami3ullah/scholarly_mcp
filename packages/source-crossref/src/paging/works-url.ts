import type { Doi } from '@scholarly-mcp/core';
import type { CrossrefConfig } from '../config/crossref-config.js';

/** Either a page of a cursor walk, or a lookup of specific DOIs. */
export type WorksQuery =
  { readonly cursor: string; readonly from?: Date } | { readonly dois: readonly Doi[] };

/**
 * Builds a `/prefixes/{prefix}/works` URL. Walks sort by deposit date ascending, so the latest
 * deposit seen is a safe restart point. `from-update-date` takes a UTC day; the source filters
 * the exact instant itself. A walk must send the same query with every cursor, so `from`
 * changes only when a walk restarts.
 */
export function worksUrl(config: CrossrefConfig, query: WorksQuery): URL {
  const url = new URL(
    `prefixes/${config.CROSSREF_PREFIX}/works`,
    withSlash(config.CROSSREF_API_URL),
  );
  const filters = ['type:journal-article'];
  if (config.CROSSREF_FROM_PUB_DATE) filters.push(`from-pub-date:${config.CROSSREF_FROM_PUB_DATE}`);
  if ('cursor' in query) {
    if (query.from) filters.push(`from-update-date:${query.from.toISOString().slice(0, 10)}`);
    url.searchParams.set('sort', 'deposited');
    url.searchParams.set('order', 'asc');
    url.searchParams.set('rows', String(config.CROSSREF_ROWS));
    url.searchParams.set('cursor', query.cursor);
  } else {
    filters.push(...query.dois.map((doi) => `doi:${doi}`));
    url.searchParams.set('rows', String(query.dois.length));
  }
  url.searchParams.set('filter', filters.join(','));
  if (config.CROSSREF_MAILTO) url.searchParams.set('mailto', config.CROSSREF_MAILTO);
  return url;
}

function withSlash(base: string): string {
  return base.endsWith('/') ? base : `${base}/`;
}
