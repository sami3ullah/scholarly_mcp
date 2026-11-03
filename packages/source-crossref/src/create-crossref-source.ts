import { setTimeout as delay } from 'node:timers/promises';
import { appError, type Clock, type Doi, type Logger, type Source } from '@scholarly-mcp/core';
import {
  createHttpClient,
  minRequestGapMs,
  type HttpClient,
  type Sleep,
} from '@scholarly-mcp/http';
import type { CrossrefConfig } from './config/crossref-config.js';
import { decodeListCursor, encodeListCursor } from './paging/list-cursor.js';
import { decodeCursor, encodeCursor, type CursorState } from './paging/source-cursor.js';
import { worksUrl } from './paging/works-url.js';
import { LOOKUP_BATCH, pageArticles } from './page-articles.js';
import { readWorks } from './read-works.js';
import type { CrossrefWork } from './work/crossref-work.js';

/** What {@link createCrossrefSource} needs. Only `config`, `clock` and `logger` are required. */
export interface CrossrefSourceOptions {
  readonly config: CrossrefConfig;
  readonly clock: Clock;
  readonly logger: Logger;
  /** Only these DOIs, looked up in batches, instead of walking the whole prefix (ADR 0039). */
  readonly dois?: readonly Doi[];
  readonly fetch?: typeof fetch;
  readonly sleep?: Sleep;
  readonly random?: () => number;
}

/**
 * Creates the Crossref source: it walks the configured DOI prefix with deep-paging cursors,
 * sorted by deposit date, and emits canonical journal articles. Notices are skipped; the
 * articles a retraction notice retracts are fetched and emitted as retracted, so an
 * incremental run catches a retraction even when the original was not re-deposited. When
 * Crossref expires a cursor, the walk restarts from the latest deposit already seen.
 *
 * With `dois` it looks up just those DOIs, a batch per page, still within the prefix and the
 * publication-date scope, so a small index such as the demo index builds in minutes.
 *
 * Requests run one at a time, as Crossref asks; do not call `fetchPage` concurrently.
 */
export function createCrossrefSource(options: CrossrefSourceOptions): Source {
  const { config, clock } = options;
  const logger = options.logger.child({ source: 'crossref' });
  const http = createHttpClient({
    name: 'Crossref',
    accept: 'application/json',
    gapFromHeaders: minRequestGapMs,
    fetch: options.fetch ?? globalThis.fetch,
    clock,
    sleep: options.sleep ?? ((ms, signal) => delay(ms, undefined, { signal })),
    random: options.random ?? Math.random,
    logger,
    userAgent: userAgent(config),
    timeoutMs: config.CROSSREF_TIMEOUT_MS,
    maxRetries: config.CROSSREF_MAX_RETRIES,
  });

  const lookupIn = (signal: AbortSignal) => async (dois: readonly Doi[]) => {
    const found = readWorks(await getJson(http, worksUrl(config, { dois }), signal));
    return found.kind === 'page' ? found.works : [];
  };

  const list = options.dois === undefined ? undefined : [...new Set(options.dois)];
  if (list !== undefined) {
    return {
      name: 'crossref',
      async fetchPage(request, signal) {
        signal.throwIfAborted();
        const offset = request.cursor === undefined ? 0 : decodeListCursor(request.cursor);
        const batch = list.slice(offset, offset + LOOKUP_BATCH);
        const lookup = lookupIn(signal);
        const found = batch.length === 0 ? [] : await lookup(batch);
        const since = request.updatedSince;
        const works = found.filter(
          (work) => since === undefined || new Date(work.deposited['date-time']) >= since,
        );
        const { articles, skipped, followedUp } = await pageArticles(works, clock.now(), lookup);
        logger.info(
          { emitted: articles.length, skipped, notFound: batch.length - found.length, followedUp },
          'Crossref DOI batch read',
        );
        const next = offset + batch.length;
        return {
          articles,
          ...(next < list.length && { nextCursor: encodeListCursor(next) }),
        };
      },
    };
  }

  return {
    name: 'crossref',
    async fetchPage(request, signal) {
      signal.throwIfAborted();
      let state: CursorState =
        request.cursor === undefined
          ? { crossref: '*', ...(request.updatedSince && { from: request.updatedSince }) }
          : decodeCursor(request.cursor);
      let page = readWorks(await getJson(http, walkUrl(config, state), signal));
      if (page.kind === 'cursor-expired') {
        state = restart(state, logger);
        page = readWorks(await getJson(http, walkUrl(config, state), signal));
      }
      if (page.kind === 'cursor-expired') {
        throw appError('SOURCE_UNAVAILABLE', 'Crossref rejected a fresh cursor');
      }

      const from = state.from;
      const works = page.works.filter(
        (work) => from === undefined || new Date(work.deposited['date-time']) >= from,
      );
      const watermark = latestDeposit(page.works, state.watermark);
      const { articles, skipped, followedUp } = await pageArticles(
        works,
        clock.now(),
        lookupIn(signal),
      );
      logger.info(
        { emitted: articles.length, skipped, invalid: page.invalid, followedUp },
        'Crossref page read',
      );
      return {
        articles,
        ...(page.nextCursor !== undefined && {
          nextCursor: encodeCursor({
            crossref: page.nextCursor,
            ...(from && { from }),
            ...(watermark && { watermark }),
          }),
        }),
      };
    },
  };
}

/** Starts a fresh walk from the latest deposit already emitted, or the original window. */
function restart(state: CursorState, logger: Logger): CursorState {
  if (state.crossref === '*') {
    throw appError('SOURCE_UNAVAILABLE', 'Crossref rejected a fresh cursor');
  }
  const from = state.watermark ?? state.from;
  logger.warn({ from: from?.toISOString() }, 'Crossref cursor expired, restarting the walk');
  return {
    crossref: '*',
    ...(from && { from }),
    ...(state.watermark && { watermark: state.watermark }),
  };
}

function walkUrl(config: CrossrefConfig, state: CursorState): URL {
  return worksUrl(config, { cursor: state.crossref, ...(state.from && { from: state.from }) });
}

function latestDeposit(
  works: readonly CrossrefWork[],
  previous: Date | undefined,
): Date | undefined {
  return works.reduce<Date | undefined>((latest, work) => {
    const deposited = new Date(work.deposited['date-time']);
    return latest === undefined || deposited > latest ? deposited : latest;
  }, previous);
}

function getJson(http: HttpClient, url: URL, signal: AbortSignal) {
  return http.get(url, (text) => JSON.parse(text) as unknown, signal);
}

function userAgent(config: CrossrefConfig): string {
  const contact = config.CROSSREF_MAILTO ? `; mailto:${config.CROSSREF_MAILTO}` : '';
  return `scholarly-mcp (https://github.com/sami3ullah/scholarly_mcp${contact})`;
}
