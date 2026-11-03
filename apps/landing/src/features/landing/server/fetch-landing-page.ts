import 'server-only';
import { doiUrl, landingPageSchema, type LandingPage } from '@scholarly-mcp/core';
import type { LandingParams } from '../model/landing-params';
import { apiHeaders, type LandingApiDeps } from './landing-api';

/** What a landing link resolves to. */
export type LandingResult =
  | { readonly kind: 'page'; readonly page: LandingPage }
  | { readonly kind: 'redirect'; readonly url: string }
  | { readonly kind: 'not-found' };

/**
 * Asks the landing API for a link's page (ADR 0032). When there is no page, or the API is
 * down, a link with a DOI goes to the article through doi.org, so the reader never sees an
 * error page (PLAN.md links and landing pages). Only a link without a DOI can end on the
 * not-found page, or on the error page when the API fails. The token and DOI are the only
 * things sent.
 */
export async function fetchLandingPage(
  { token, doi }: Pick<LandingParams, 'token' | 'doi'>,
  deps: LandingApiDeps,
): Promise<LandingResult> {
  if (token === undefined && doi === undefined) return { kind: 'not-found' };
  const url = new URL('landing/v1/page', withSlash(deps.env.LANDING_API_URL));
  if (token !== undefined) url.searchParams.set('t', token);
  if (doi !== undefined) url.searchParams.set('doi', doi);
  const fallback =
    doi === undefined ? undefined : ({ kind: 'redirect', url: doiUrl(doi) } as const);

  let response: Response;
  try {
    response = await deps.fetch(url, {
      headers: apiHeaders(deps),
      cache: 'no-store',
      signal: AbortSignal.timeout(deps.env.LANDING_API_TIMEOUT_MS),
    });
  } catch (error) {
    if (fallback === undefined) throw error;
    deps.logger.warn({ err: error }, 'Landing API unreachable; sending the reader to the DOI');
    return fallback;
  }
  if (response.status === 404 || response.status === 400) return fallback ?? { kind: 'not-found' };
  const parsed = response.ok
    ? landingPageSchema.safeParse(await response.json().catch(() => undefined))
    : undefined;
  if (parsed?.success === true) return { kind: 'page', page: parsed.data };
  const reason = parsed === undefined ? `status ${String(response.status)}` : 'invalid page';
  if (fallback === undefined) throw new Error(`Landing API failed: ${reason}`);
  deps.logger.warn({ reason }, 'Landing API failed; sending the reader to the DOI');
  return fallback;
}

function withSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}
