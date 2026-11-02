import { appError, type Clock, type Logger } from '@scholarly-mcp/core';
import { backoffDelay, MAX_DELAY_MS, minRequestGapMs, retryAfterMs } from './retry-timing.js';

/** Waits `ms`, rejecting early when `signal` aborts. */
export type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

/** What {@link createCrossrefHttp} needs. Time, randomness and the network are injected. */
export interface CrossrefHttpOptions {
  readonly fetch: typeof fetch;
  readonly clock: Clock;
  readonly sleep: Sleep;
  readonly random: () => number;
  readonly logger: Logger;
  readonly userAgent: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
}

/** A final, non-retryable answer: success, or an error Crossref meant (e.g. an invalid cursor). */
export interface CrossrefResponse {
  readonly status: number;
  readonly body: unknown;
}

/** A GET client for the Crossref REST API, one request at a time. */
export interface CrossrefHttp {
  getJson(url: URL, signal: AbortSignal): Promise<CrossrefResponse>;
}

type Failure = { readonly reason: string; readonly status?: number; readonly waitMs?: number };

/**
 * Creates the HTTP client. It spaces requests by Crossref's advertised rate limit, times out
 * each attempt, and retries 429s, 5xx responses, timeouts, network errors and truncated JSON
 * with exponential backoff and jitter, waiting at least as long as `Retry-After` asks. A
 * caller's abort is never retried. When retries run out, it throws an AppError.
 */
export function createCrossrefHttp(options: CrossrefHttpOptions): CrossrefHttp {
  const { clock, sleep, random, logger, maxRetries } = options;
  let nextRequestAt = 0;

  async function attempt(url: URL, signal: AbortSignal): Promise<CrossrefResponse | Failure> {
    const wait = nextRequestAt - clock.now().getTime();
    if (wait > 0) await sleep(wait, signal);
    const startedAt = clock.now().getTime();
    try {
      const response = await options.fetch(url, {
        headers: { accept: 'application/json', 'user-agent': options.userAgent },
        signal: AbortSignal.any([signal, AbortSignal.timeout(options.timeoutMs)]),
      });
      nextRequestAt = startedAt + (minRequestGapMs(response.headers) ?? 0);
      const waitMs = retryAfterMs(response.headers.get('retry-after'), clock.now());
      const { status } = response;
      if (status === 429 || status >= 500) {
        await response.body?.cancel();
        return {
          reason: `HTTP ${String(status)}`,
          status,
          ...(waitMs !== undefined && { waitMs }),
        };
      }
      const text = await response.text();
      try {
        return { status, body: JSON.parse(text) as unknown };
      } catch {
        return { reason: 'unreadable JSON', status };
      }
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      return {
        reason:
          error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network error',
      };
    }
  }

  return {
    async getJson(url, signal) {
      signal.throwIfAborted();
      for (let attemptNumber = 0; ; attemptNumber += 1) {
        const result = await attempt(url, signal);
        if ('body' in result) return result;
        const delay = result.waitMs ?? backoffDelay(attemptNumber, random);
        if (attemptNumber >= maxRetries || delay > MAX_DELAY_MS)
          throw exhausted(result, attemptNumber + 1);
        logger.warn(
          { reason: result.reason, attempt: attemptNumber + 1, delayMs: delay },
          'Crossref request failed, retrying',
        );
        await sleep(delay, signal);
      }
    },
  };
}

function exhausted(failure: Failure, attempts: number) {
  const message = `Crossref request failed after ${String(attempts)} attempt(s): ${failure.reason}`;
  if (failure.status !== 429) return appError('SOURCE_UNAVAILABLE', message);
  const retryAfterSeconds = Math.ceil((failure.waitMs ?? MAX_DELAY_MS) / 1000);
  return appError('RATE_LIMITED', message, { retryAfterSeconds });
}
