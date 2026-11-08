import {
  createFunnelCounter,
  readUsageEvents,
  type Clock,
  type Funnel,
  type FunnelOptions,
  type Logger,
  type UsageOutbox,
} from '@scholarly-mcp/core';
import type { HttpHandler } from '../http/create-http-handler.js';
import { funnelFiltersFrom } from './funnel-filters.js';
import { renderFunnelReport } from './render-funnel-report.js';

export interface FunnelViewDeps {
  /** The store's events: the outbox keeps exported ones for `METER_RETENTION_DAYS`. */
  readonly outbox: Pick<UsageOutbox, 'list'>;
  readonly publisher: string;
  readonly clock: Clock;
  readonly logger: Logger;
  /** What the report names as its source. */
  readonly source: string;
  /** How long one count is reused and how often the page reloads itself. */
  readonly refreshSeconds: number;
  /** Filters for requests that set none of their own. */
  readonly filters: FunnelOptions;
  /** Longest one count may read the store. */
  readonly timeoutMs?: number;
}

/** Counts kept at once, one per filter set; the oldest goes first. */
const MAX_COUNTS = 32;

const HEADERS = {
  'cache-control': 'no-store',
  'content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

/**
 * The live funnel (ADR 0035): `GET /` renders the report over the events in the store now,
 * `GET /funnel.json` gives the same numbers. `?since=YYYY-MM-DD&until=YYYY-MM-DD`
 * replace the default filters. A count is reused for `refreshSeconds`, and requests for
 * the same filters meanwhile share one read, so reloads cannot pile up on the database.
 */
export function createFunnelView(deps: FunnelViewDeps): HttpHandler {
  const counts = new Map<string, { readonly at: number; readonly funnel: Promise<Funnel> }>();
  const ttlMs = deps.refreshSeconds * 1000;

  const count = (filters: FunnelOptions): Promise<Funnel> => {
    const key = JSON.stringify(filters);
    const now = deps.clock.now().getTime();
    const cached = counts.get(key);
    if (cached !== undefined && now - cached.at < ttlMs) return cached.funnel;
    const funnel = countFrom(deps, filters);
    counts.delete(key);
    counts.set(key, { at: now, funnel });
    if (counts.size > MAX_COUNTS) counts.delete(counts.keys().next().value ?? key);
    funnel.catch(() => {
      if (counts.get(key)?.funnel === funnel) counts.delete(key);
    });
    return funnel;
  };

  return {
    fetch: async (request) => {
      const url = new URL(request.url);
      if (url.pathname !== '/' && url.pathname !== '/funnel.json') {
        return text(404, 'Not found');
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', {
          status: 405,
          headers: { ...HEADERS, allow: 'GET, HEAD' },
        });
      }
      const filters = filtersOf(url.searchParams, deps.filters);
      if (filters === undefined) return text(400, 'since and until must be YYYY-MM-DD days');

      let funnel;
      try {
        funnel = await count(filters);
      } catch (error) {
        deps.logger.warn({ err: error }, 'Funnel count failed');
        return text(503, 'The funnel is unavailable; see the log');
      }
      if (url.pathname === '/funnel.json') {
        return new Response(`${JSON.stringify({ filters, ...funnel }, null, 2)}\n`, {
          headers: { ...HEADERS, 'content-type': 'application/json' },
        });
      }
      const html = renderFunnelReport(funnel, {
        publisher: deps.publisher,
        generatedAt: deps.clock.now(),
        filters,
        skippedLines: 0,
        source: deps.source,
        refreshSeconds: deps.refreshSeconds,
      });
      return new Response(html, {
        headers: { ...HEADERS, 'content-type': 'text/html; charset=utf-8' },
      });
    },
  };
}

async function countFrom(deps: FunnelViewDeps, filters: FunnelOptions): Promise<Funnel> {
  const counter = createFunnelCounter(filters);
  const signal = AbortSignal.timeout(deps.timeoutMs ?? 30_000);
  for await (const event of readUsageEvents(deps.outbox, filters, signal)) counter.add(event);
  return counter.result();
}

/** The request's own filters when it sets any, else the defaults; undefined when invalid. */
function filtersOf(params: URLSearchParams, defaults: FunnelOptions): FunnelOptions | undefined {
  if (!['since', 'until'].some((name) => params.has(name))) return defaults;
  return funnelFiltersFrom({
    since: params.get('since') ?? undefined,
    until: params.get('until') ?? undefined,
  });
}

function text(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { ...HEADERS, 'content-type': 'text/plain; charset=utf-8' },
  });
}
