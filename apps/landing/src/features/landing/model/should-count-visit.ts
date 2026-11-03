import { isPrefetch } from './is-prefetch';

/**
 * Whether a beacon request counts as a reader's visit: it must come from this site's own
 * page (browsers mark that in `Sec-Fetch-Site`) and not from a prefetch or preview agent.
 * Older browsers without fetch metadata are trusted on the user agent alone.
 */
export function shouldCountVisit(headers: Pick<Headers, 'get'>): boolean {
  const site = headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin') return false;
  return !isPrefetch(headers);
}
