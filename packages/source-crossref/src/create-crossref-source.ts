import { setTimeout as delay } from 'node:timers/promises';
import { appError, type Clock, type Doi, type Logger, type Source } from '@scholarly-mcp/core';
import type { CrossrefConfig } from './config/crossref-config.js';
import { createCrossrefHttp, type Sleep } from './http/crossref-http.js';
import { decodeCursor, encodeCursor, type CursorState } from './paging/source-cursor.js';
import { worksUrl } from './paging/works-url.js';
import { pageArticles } from './page-articles.js';
import { readWorks } from './read-works.js';
import type { CrossrefWork } from './work/crossref-work.js';

/** What {@link createCrossrefSource} needs. Only `config`, `clock` and `logger` are required. */
export interface CrossrefSourceOptions {
  readonly config: CrossrefConfig;
  readonly clock: Clock;
  readonly logger: Logger;
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
 * Requests run one at a time, as Crossref asks; do not call `fetchPage` concurrently.
 */
export function createCrossrefSource(options: CrossrefSourceOptions): Source {
  const { config, clock } = options;
  const logger = options.logger.child({ source: 'crossref' });
  const http = createCrossrefHttp({
    fetch: options.fetch ?? globalThis.fetch,
    clock,
    sleep: options.sleep ?? ((ms, signal) => delay(ms, undefined, { signal })),
    random: options.random ?? Math.random,
    logger,
    userAgent: userAgent(config),
    timeoutMs: config.CROSSREF_TIMEOUT_MS,
    maxRetries: config.CROSSREF_MAX_RETRIES,
  });

  return {
    name: 'crossref',
    async fetchPage(request, signal) {
      signal.throwIfAborted();
      let state: CursorState =
        request.cursor === undefined
          ? { crossref: '*', ...(request.updatedSince && { from: request.updatedSince }) }
          : decodeCursor(request.cursor);
      let page = readWorks(await http.getJson(walkUrl(config, state), signal));
      if (page.kind === 'cursor-expired') {
        state = restart(state, logger);
        page = readWorks(await http.getJson(walkUrl(config, state), signal));
      }
      if (page.kind === 'cursor-expired') {
        throw appError('SOURCE_UNAVAILABLE', 'Crossref rejected a fresh cursor');
      }

      const from = state.from;
      const works = page.works.filter(
        (work) => from === undefined || new Date(work.deposited['date-time']) >= from,
      );
      const watermark = latestDeposit(page.works, state.watermark);
      const lookup = async (dois: readonly Doi[]) => {
        const found = readWorks(await http.getJson(worksUrl(config, { dois }), signal));
        return found.kind === 'page' ? found.works : [];
      };
      const { articles, skipped, followedUp } = await pageArticles(works, clock.now(), lookup);
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

function userAgent(config: CrossrefConfig): string {
  const contact = config.CROSSREF_MAILTO ? `; mailto:${config.CROSSREF_MAILTO}` : '';
  return `scholarly-mcp (https://github.com/sami3ullah/scholarly_mcp${contact})`;
}
