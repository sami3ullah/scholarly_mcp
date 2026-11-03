import type {
  Clock,
  Embedder,
  Entitlements,
  Logger,
  Meter,
  RandomToken,
  SessionStore,
} from '@scholarly-mcp/core';
import { createSearchService, type SearchOptions } from '@scholarly-mcp/search';
import { createMockEntitlements } from './access/create-mock-entitlements.js';
import { createJournalCatalog } from './journals/journal-catalog.js';
import { createLandingPages, type LandingPages } from './landing/create-landing-pages.js';
import { createReferrals, type Referrals } from './landing/create-referrals.js';
import { createLinkMaker } from './landing/create-link-maker.js';
import type { RateLimiter } from './limits/create-rate-limiter.js';
import type { LiveIndex } from './runtime/live-index.js';
import { createServerFactory } from './server/create-server-factory.js';
import type { ServerMetrics } from './telemetry/create-metrics.js';
import { createTools } from './tools/create-tools.js';
import { noticeFor } from './tools/notice.js';

/** The adapters and settings the app is wired from; `main.ts` builds the real ones. */
export interface AppDeps {
  readonly index: Pick<LiveIndex, 'reader' | 'search' | 'journals' | 'version'>;
  readonly embedder: Pick<Embedder, 'embedQuery'>;
  readonly sessions: SessionStore;
  readonly tokens: RandomToken;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly landingBaseUrl: string;
  readonly publisher: string;
  readonly journalUrlTemplate?: string;
  readonly searchOptions?: Partial<SearchOptions>;
  readonly version: string;
  readonly limiter: RateLimiter;
  readonly meter: Meter;
  readonly eventId: () => string;
  readonly metrics?: ServerMetrics;
  /** Defaults to the mock adapter (ADR 0025); a publisher plugs in its own. */
  readonly entitlements?: Entitlements;
}

/** The wired app: the MCP server factory, the landing pages its links open and their referrals. */
export interface App {
  readonly factory: ReturnType<typeof createServerFactory>;
  readonly landingPages: LandingPages;
  readonly referrals: Referrals;
}

/**
 * Wires the search service into the six tools and the landing pages. Kept apart from
 * `main.ts` so protocol tests run the real wiring on in-memory adapters.
 */
export function createApp(deps: AppDeps): App {
  const { index, clock, logger, publisher } = deps;
  const notice = noticeFor(publisher);
  const search = createSearchService({
    reader: index.reader,
    search: index.search,
    embedder: deps.embedder,
    clock,
    logger: logger.child({ component: 'search' }),
    ...(deps.searchOptions !== undefined && { options: deps.searchOptions }),
  });
  const entitlements = deps.entitlements ?? createMockEntitlements();
  const template = deps.journalUrlTemplate;
  const tools = createTools({
    search,
    reader: index.reader,
    journals: createJournalCatalog(index.journals, () => index.version()),
    links: createLinkMaker({
      baseUrl: deps.landingBaseUrl,
      sessions: deps.sessions,
      tokens: deps.tokens,
      clock,
      logger: logger.child({ component: 'landing' }),
    }),
    entitlements,
    clock,
    publisher,
    notice,
    ...(template !== undefined && {
      journalUrl: (issn: string) => template.replaceAll('{issn}', encodeURIComponent(issn)),
    }),
  });
  const factory = createServerFactory({
    tools,
    version: deps.version,
    notice,
    publisher,
    logger,
    clock,
    limiter: deps.limiter,
    meter: deps.meter,
    eventId: deps.eventId,
    ...(deps.metrics !== undefined && { metrics: deps.metrics }),
  });
  return {
    factory,
    landingPages: createLandingPages({
      reader: index.reader,
      search,
      sessions: deps.sessions,
      entitlements,
      clock,
      logger: logger.child({ component: 'landing' }),
    }),
    referrals: createReferrals({
      reader: index.reader,
      sessions: deps.sessions,
      meter: deps.meter,
      clock,
      logger: logger.child({ component: 'referrals' }),
    }),
  };
}
