import type { Doi } from '@scholarly-mcp/core';
import type { EuropepmcConfig } from '../config/europepmc-config.js';

/** Europe PMC returns at most this many hits per page. */
const SEARCH_PAGE_SIZE = 1000;

/** DOIs that can be quoted in a Europe PMC query; one with a quote or backslash cannot. */
export function isQueryableDoi(doi: Doi): boolean {
  return !/["\\]/.test(doi);
}

/**
 * The search URL for a batch of DOIs: `DOI:"…" OR DOI:"…"`, `core` results (which carry MeSH
 * headings, keywords and licence fields), JSON, one cursor page.
 */
export function searchUrl(config: EuropepmcConfig, dois: readonly Doi[], cursorMark: string): URL {
  const url = new URL(`${config.EUROPEPMC_API_URL.replace(/\/+$/, '')}/search`);
  url.searchParams.set('query', dois.map((doi) => `DOI:"${doi}"`).join(' OR '));
  url.searchParams.set('resultType', 'core');
  url.searchParams.set('format', 'json');
  url.searchParams.set('pageSize', String(SEARCH_PAGE_SIZE));
  url.searchParams.set('cursorMark', cursorMark);
  return url;
}

/** The JATS full text of an open access article. */
export function fullTextUrl(config: EuropepmcConfig, pmcid: string): URL {
  return new URL(
    `${config.EUROPEPMC_API_URL.replace(/\/+$/, '')}/${encodeURIComponent(pmcid)}/fullTextXML`,
  );
}
