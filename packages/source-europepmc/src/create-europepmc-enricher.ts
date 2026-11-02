import { setTimeout as delay } from 'node:timers/promises';
import {
  appError,
  isAppError,
  type ArticleEnricher,
  type Clock,
  type Doi,
  type Enrichment,
  type FulltextConfig,
  type Logger,
} from '@scholarly-mcp/core';
import { createHttpClient, type HttpClient, type Sleep } from '@scholarly-mcp/http';
import type { EuropepmcConfig } from './config/europepmc-config.js';
import { readFullText } from './fulltext/read-full-text.js';
import { searchHitSchema, searchResponseSchema, type SearchHit } from './search/search-hit.js';
import { fullTextUrl, isQueryableDoi, searchUrl } from './search/search-url.js';
import { chooseHits, toEnrichment } from './search/to-enrichment.js';

/**
 * After this many full-text fetches in a row fail with retries exhausted, Europe PMC is
 * taken to be down and the run fails, to resume later, instead of trying every article.
 */
export const MAX_CONSECUTIVE_FULLTEXT_FAILURES = 5;

/** What {@link createEuropepmcEnricher} needs. Only `config`, `fulltext`, `clock` and `logger` are required. */
export interface EuropepmcEnricherOptions {
  readonly config: EuropepmcConfig;
  /** The licence allowlist for full text (ADR 0003). */
  readonly fulltext: FulltextConfig;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly fetch?: typeof fetch;
  readonly sleep?: Sleep;
  readonly random?: () => number;
}

/**
 * Creates the Europe PMC enricher (ADR 0004, ADR 0024). `lookup` searches DOIs in batches and
 * returns MeSH and keyword subjects for every match, plus a full-text reference when the
 * article may have its full text indexed. `fetchFullText` reads that JATS text into sections
 * for matching only. A text that is missing, another version or unreadable is skipped and
 * logged, so the article is indexed from its metadata; persistent failures fail the run.
 *
 * Requests run one at a time; do not call it concurrently.
 */
export function createEuropepmcEnricher(options: EuropepmcEnricherOptions): ArticleEnricher {
  const { config, clock } = options;
  const allowlist = options.fulltext.FULLTEXT_LICENSE_ALLOWLIST;
  const logger = options.logger.child({ enricher: 'europepmc' });
  const http = createHttpClient({
    name: 'Europe PMC',
    // Search answers JSON, full text XML; the full-text route refuses a JSON-only accept (406).
    accept: 'application/json, application/xml',
    minGapMs: config.EUROPEPMC_REQUEST_GAP_MS,
    fetch: options.fetch ?? globalThis.fetch,
    clock,
    sleep: options.sleep ?? ((ms, signal) => delay(ms, undefined, { signal })),
    random: options.random ?? Math.random,
    logger,
    userAgent: 'scholarly-mcp (https://github.com/sami3ullah/scholarly_mcp)',
    timeoutMs: config.EUROPEPMC_TIMEOUT_MS,
    maxRetries: config.EUROPEPMC_MAX_RETRIES,
  });
  let consecutiveFailures = 0;

  return {
    name: 'europepmc',
    async lookup(articles, signal) {
      signal.throwIfAborted();
      const byDoi = new Map(articles.map((article) => [article.doi, article]));
      const dois = [...byDoi.keys()].filter(isQueryableDoi);
      const found = new Map<Doi, Enrichment>();
      let invalid = 0;
      for (let start = 0; start < dois.length; start += config.EUROPEPMC_BATCH_SIZE) {
        const batch = dois.slice(start, start + config.EUROPEPMC_BATCH_SIZE);
        const result = await searchAll(http, config, batch, signal);
        invalid += result.invalid;
        for (const [doi, hit] of chooseHits(result.hits, new Set(batch))) {
          const article = byDoi.get(doi);
          if (article !== undefined) {
            found.set(doi, toEnrichment(hit, article, allowlist, clock.now()));
          }
        }
      }
      if (dois.length > 0) {
        logger.info(
          {
            requested: dois.length,
            matched: found.size,
            withFullText: [...found.values()].filter((entry) => entry.fullText).length,
            invalid,
          },
          'Europe PMC lookup done',
        );
      }
      return found;
    },

    async fetchFullText(doi, ref, signal) {
      signal.throwIfAborted();
      let response;
      try {
        response = await http.get(fullTextUrl(config, ref.id), (text) => text, signal);
      } catch (error) {
        if (signal.aborted || !isAppError(error) || error.code !== 'SOURCE_UNAVAILABLE') {
          throw error;
        }
        consecutiveFailures += 1;
        logger.warn({ doi, pmcid: ref.id, consecutiveFailures }, 'Full text unavailable, skipped');
        if (consecutiveFailures >= MAX_CONSECUTIVE_FULLTEXT_FAILURES) {
          throw appError(
            'SOURCE_UNAVAILABLE',
            `Europe PMC full text failed ${String(consecutiveFailures)} times in a row`,
          );
        }
        return undefined;
      }
      consecutiveFailures = 0;
      if (response.status !== 200) {
        logger.warn({ doi, pmcid: ref.id, status: response.status }, 'Full text missing, skipped');
        return undefined;
      }
      const result = readFullText(response.body, { doi, licenseUrl: ref.licenseUrl });
      if (result.kind === 'rejected') {
        logger.warn({ doi, pmcid: ref.id, reason: result.reason }, 'Full text not used');
        return undefined;
      }
      return result.sections;
    },
  };
}

/** Every hit for one batch of DOIs, following Europe PMC's cursor while it moves. */
async function searchAll(
  http: HttpClient,
  config: EuropepmcConfig,
  dois: readonly Doi[],
  signal: AbortSignal,
): Promise<{ hits: SearchHit[]; invalid: number }> {
  const hits: SearchHit[] = [];
  let invalid = 0;
  let cursor = '*';
  for (;;) {
    const response = await http.get(
      searchUrl(config, dois, cursor),
      (text) => JSON.parse(text) as unknown,
      signal,
    );
    if (response.status !== 200) {
      throw appError(
        'SOURCE_UNAVAILABLE',
        `Europe PMC search failed: HTTP ${String(response.status)}`,
      );
    }
    const page = searchResponseSchema.safeParse(response.body);
    if (!page.success) {
      throw appError('SOURCE_UNAVAILABLE', 'Europe PMC search returned an unexpected shape');
    }
    const results = page.data.resultList.result;
    for (const result of results) {
      const hit = searchHitSchema.safeParse(result);
      if (hit.success) hits.push(hit.data);
      else invalid += 1;
    }
    const next = page.data.nextCursorMark;
    if (next === undefined || next === cursor || results.length === 0) break;
    if (hits.length + invalid >= page.data.hitCount) break;
    cursor = next;
  }
  return { hits, invalid };
}
