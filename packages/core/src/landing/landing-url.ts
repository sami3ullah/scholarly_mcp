import type { Doi } from '../article/doi.js';
import type { ToolName } from '../metering/tool-name.js';
import type { Token } from './token.js';

/** The landing page's path below `LANDING_BASE_URL` (PLAN.md "The article card"). */
export const LANDING_PATH = '/mcp/landing';

/** What a landing link is built from. Never query text (key design decision 12). */
export interface LandingLink {
  readonly baseUrl: string;
  /** The tool whose result the link belongs to; becomes `utm_campaign`. */
  readonly tool: ToolName;
  /** The landing session; absent when none could be stored, so the page falls back to the DOI. */
  readonly token?: Token;
  /** The chosen article; absent for the collection link that shows all results. */
  readonly doi?: Doi;
}

/**
 * Builds a landing link such as `…/mcp/landing?t=<token>&doi=<doi>&utm_source=mcp&
 * utm_medium=ai&utm_campaign=search_articles`. The token alone attributes a visit when a
 * browser strips the UTM tags; without a token the page shows the article by its DOI.
 */
export function buildLandingUrl({ baseUrl, tool, token, doi }: LandingLink): string {
  // Relative to the base with a trailing slash, so a base path such as `/thieme` is kept.
  const url = new URL(LANDING_PATH.slice(1), withTrailingSlash(baseUrl));
  if (token !== undefined) url.searchParams.set('t', token);
  if (doi !== undefined) url.searchParams.set('doi', doi);
  url.searchParams.set('utm_source', 'mcp');
  url.searchParams.set('utm_medium', 'ai');
  url.searchParams.set('utm_campaign', tool);
  return url.toString();
}

function withTrailingSlash(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}
