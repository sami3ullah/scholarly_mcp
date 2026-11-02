/** Backoff bounds. Crossref asks clients to back off, not to give up quickly. */
export const BASE_DELAY_MS = 1_000;
export const MAX_DELAY_MS = 60_000;

/**
 * Exponential backoff with full jitter: a random wait between zero and `BASE * 2^attempt`,
 * capped. Jitter spreads retries out, so clients that failed together do not retry together.
 */
export function backoffDelay(attempt: number, random: () => number): number {
  return Math.floor(random() * Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt));
}

/** Reads `Retry-After` as seconds or an HTTP date; returns milliseconds to wait. */
export function retryAfterMs(header: string | null, now: Date): number | undefined {
  if (header === null || header.trim() === '') return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now.getTime());
}

/**
 * The minimum gap between requests that Crossref's `x-rate-limit-limit` and
 * `x-rate-limit-interval` headers allow, e.g. 1 request per `1s` gives 1000 ms.
 */
export function minRequestGapMs(headers: Headers): number | undefined {
  const limit = Number(headers.get('x-rate-limit-limit'));
  const interval = /^(\d+)s$/.exec(headers.get('x-rate-limit-interval')?.trim() ?? '')?.[1];
  if (!Number.isInteger(limit) || limit <= 0 || interval === undefined) return undefined;
  return Math.ceil((Number(interval) * 1000) / limit);
}
