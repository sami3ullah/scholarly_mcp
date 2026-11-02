import { appError, type Clock, type Logger } from '@scholarly-mcp/core';
import { backoffDelay, MAX_DELAY_MS, retryAfterMs } from './retry-timing.js';

/** Waits `ms`, rejecting early when `signal` aborts. */
export type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

/** What {@link createHttpClient} needs. Time, randomness and the network are injected. */
export interface HttpClientOptions {
  /** The API's name, used in log lines and error messages, e.g. `Crossref`. */
  readonly name: string;
  readonly fetch: typeof fetch;
  readonly clock: Clock;
  readonly sleep: Sleep;
  readonly random: () => number;
  readonly logger: Logger;
  readonly userAgent: string;
  /** The `accept` header, e.g. `application/json`. */
  readonly accept: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  /** The least time between the starts of two requests, unless the API advertises another. */
  readonly minGapMs?: number;
  /** Reads the gap an API advertises in its response headers; it wins over `minGapMs`. */
  readonly gapFromHeaders?: (headers: Headers) => number | undefined;
}

/** A final, non-retryable answer: success, or an error the API meant (e.g. an invalid cursor). */
export interface HttpResponse<T> {
  readonly status: number;
  readonly body: T;
}

/**
 * Turns a response body into a value. Throwing marks the body unreadable, e.g. JSON cut off
 * mid-stream, and the request is retried. `status` lets a reader judge only successful bodies.
 */
export type ReadBody<T> = (text: string, status: number) => T;

/** A GET client for one REST API, one request at a time. */
export interface HttpClient {
  get<T>(url: URL, read: ReadBody<T>, signal: AbortSignal): Promise<HttpResponse<T>>;
}

type Failure = { readonly reason: string; readonly status?: number; readonly waitMs?: number };

/**
 * Creates the HTTP client. It spaces requests by `minGapMs` or the gap the API advertises,
 * times out each attempt, and retries 429s, 5xx responses, timeouts, network errors and
 * unreadable bodies with exponential backoff and jitter, waiting at least as long as
 * `Retry-After` asks. A caller's abort is never retried. When retries run out, it throws an
 * AppError: `RATE_LIMITED` with `retryAfterSeconds` after 429s, else `SOURCE_UNAVAILABLE`.
 */
export function createHttpClient(options: HttpClientOptions): HttpClient {
  const { name, clock, sleep, random, logger, maxRetries } = options;
  let nextRequestAt = 0;

  async function attempt<T>(
    url: URL,
    read: ReadBody<T>,
    signal: AbortSignal,
  ): Promise<HttpResponse<T> | Failure> {
    const wait = nextRequestAt - clock.now().getTime();
    if (wait > 0) await sleep(wait, signal);
    const startedAt = clock.now().getTime();
    nextRequestAt = startedAt + (options.minGapMs ?? 0);
    try {
      const response = await options.fetch(url, {
        headers: { accept: options.accept, 'user-agent': options.userAgent },
        signal: AbortSignal.any([signal, AbortSignal.timeout(options.timeoutMs)]),
      });
      const advertised = options.gapFromHeaders?.(response.headers);
      if (advertised !== undefined) nextRequestAt = startedAt + advertised;
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
        return { status, body: read(text, status) };
      } catch {
        return { reason: 'unreadable body', status };
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
    async get(url, read, signal) {
      signal.throwIfAborted();
      for (let attemptNumber = 0; ; attemptNumber += 1) {
        const result = await attempt(url, read, signal);
        if ('body' in result) return result;
        const delay = result.waitMs ?? backoffDelay(attemptNumber, random);
        if (attemptNumber >= maxRetries || delay > MAX_DELAY_MS)
          throw exhausted(name, result, attemptNumber + 1);
        logger.warn(
          { reason: result.reason, attempt: attemptNumber + 1, delayMs: delay },
          `${name} request failed, retrying`,
        );
        await sleep(delay, signal);
      }
    },
  };
}

function exhausted(name: string, failure: Failure, attempts: number) {
  const message = `${name} request failed after ${String(attempts)} attempt(s): ${failure.reason}`;
  if (failure.status !== 429) return appError('SOURCE_UNAVAILABLE', message);
  const retryAfterSeconds = Math.ceil((failure.waitMs ?? MAX_DELAY_MS) / 1000);
  return appError('RATE_LIMITED', message, { retryAfterSeconds });
}
