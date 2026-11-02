import type {
  Caller,
  Clock,
  Embedder,
  Logger,
  RandomToken,
  SessionStore,
} from '@scholarly-mcp/core';
import { createSearchService, type SearchOptions } from '@scholarly-mcp/search';
import { createMockEntitlements } from './access/create-mock-entitlements.js';
import { createJournalCatalog } from './journals/journal-catalog.js';
import { createLinkMaker } from './landing/create-link-maker.js';
import type { LiveIndex } from './runtime/live-index.js';
import { createServerFactory } from './server/create-server-factory.js';
import { createTools } from './tools/create-tools.js';
import { noticeFor } from './tools/notice.js';

/** The caller until API keys exist (SM-10); landing sessions record it as the key id. */
export const LOCAL_CALLER: Caller = { apiKeyId: 'local' };

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
  readonly caller?: () => Caller;
}

/**
 * Wires the search service and the six tools into a server factory for the transports.
 * Kept apart from `main.ts` so protocol tests run the real wiring on in-memory adapters.
 */
export function createApp(deps: AppDeps) {
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
    entitlements: createMockEntitlements(),
    clock,
    publisher,
    notice,
    ...(template !== undefined && {
      journalUrl: (issn: string) => template.replaceAll('{issn}', encodeURIComponent(issn)),
    }),
  });
  return createServerFactory({
    tools,
    version: deps.version,
    notice,
    publisher,
    logger,
    clock,
    caller: deps.caller ?? (() => LOCAL_CALLER),
  });
}
