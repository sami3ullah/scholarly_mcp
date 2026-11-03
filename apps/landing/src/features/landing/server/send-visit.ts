import 'server-only';
import type { Visit } from '../model/visit';
import { apiHeaders, type LandingApiDeps } from './landing-api';

/**
 * Forwards a confirmed visit to the landing API. A visit is a side record: failures are
 * logged and swallowed, never shown to the reader.
 */
export async function sendVisit(visit: Visit, deps: LandingApiDeps): Promise<void> {
  const url = new URL('landing/v1/visits', `${deps.env.LANDING_API_URL.replace(/\/$/, '')}/`);
  try {
    const response = await deps.fetch(url, {
      method: 'POST',
      headers: { ...apiHeaders(deps), 'content-type': 'application/json' },
      body: JSON.stringify(visit),
      cache: 'no-store',
      signal: AbortSignal.timeout(deps.env.LANDING_API_TIMEOUT_MS),
    });
    if (!response.ok) {
      deps.logger.warn({ status: response.status }, 'Landing visit not recorded');
    }
  } catch (error) {
    deps.logger.warn({ err: error }, 'Landing visit not recorded');
  }
}
