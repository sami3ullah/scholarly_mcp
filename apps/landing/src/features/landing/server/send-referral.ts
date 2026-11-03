import 'server-only';
import type { Action, Visit } from '../model/referral';
import { apiHeaders, type LandingApiDeps } from './landing-api';

const ROUTES = { visit: 'landing/v1/visits', action: 'landing/v1/actions' } as const;

/** What the browser confirmed, on its way to the landing API. */
export type Referral =
  | { readonly kind: 'visit'; readonly body: Visit }
  | { readonly kind: 'action'; readonly body: Action };

/**
 * Forwards a confirmed visit or access button click to the landing API (ADR 0033). It is a
 * side record: failures are logged and swallowed, never shown to the reader.
 */
export async function sendReferral(referral: Referral, deps: LandingApiDeps): Promise<void> {
  const base = `${deps.env.LANDING_API_URL.replace(/\/$/, '')}/`;
  const url = new URL(ROUTES[referral.kind], base);
  const message = `Landing ${referral.kind} not recorded`;
  try {
    const response = await deps.fetch(url, {
      method: 'POST',
      headers: { ...apiHeaders(deps), 'content-type': 'application/json' },
      body: JSON.stringify(referral.body),
      cache: 'no-store',
      signal: AbortSignal.timeout(deps.env.LANDING_API_TIMEOUT_MS),
    });
    if (!response.ok) deps.logger.warn({ status: response.status }, message);
  } catch (error) {
    deps.logger.warn({ err: error }, message);
  }
}
