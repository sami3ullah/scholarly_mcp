import {
  LANDING_RELATED_LIMIT,
  type Article,
  type ArticleReader,
  type Clock,
  type Doi,
  type Entitlements,
  type LandingAccess,
  type LandingPage,
  type LandingSession,
  type Logger,
  type SessionStore,
  type Token,
} from '@scholarly-mcp/core';
import type { SearchService } from '@scholarly-mcp/search';
import { cardAccess } from '../access/card-access.js';
import { landingArticle, landingSummary } from './landing-article.js';
import { landingTopics } from './landing-topics.js';
import { matchedPassage } from './matched-passage.js';

/** What a landing link asks for; both parts are optional, so every link shape resolves. */
export interface LandingPageRequest {
  readonly token?: Token;
  readonly doi?: Doi;
}

/** Turns landing links into pages. */
export interface LandingPages {
  /**
   * Returns the page, or undefined when there is nothing to show: no live session and no
   * indexed DOI. The landing app then sends the reader to the DOI or shows its not-found page.
   */
  resolve(request: LandingPageRequest, signal: AbortSignal): Promise<LandingPage | undefined>;
  /**
   * Counts a visit the reader's browser confirmed, when the token is live. Returns whether
   * it was counted; a failing store is logged, never thrown, as a visit is a side record.
   */
  recordVisit(token: Token, signal: AbortSignal): Promise<boolean>;
}

export interface LandingPagesDeps {
  readonly reader: ArticleReader;
  readonly search: Pick<SearchService, 'related'>;
  readonly sessions: SessionStore;
  readonly entitlements: Entitlements;
  readonly clock: Clock;
  readonly logger: Logger;
}

/** The anonymous landing visitor; a publisher's entitlement adapter knows its own readers. */
const VISITOR = { apiKeyId: 'landing' } as const;

/**
 * Builds landing pages (ADR 0032). With a live token the page rebuilds the search: the
 * chosen article (the link's DOI, else the first result), the other results in order, where
 * the chosen one matched, and topics from their subjects. Without one it falls back to the
 * article by its DOI (PLAN.md: no error page). Access and related reading come from side
 * systems; when they fail the page goes without them rather than failing.
 */
export function createLandingPages(deps: LandingPagesDeps): LandingPages {
  const { reader, sessions, clock, logger } = deps;

  async function activeSession(token: Token, signal: AbortSignal) {
    try {
      const session = await sessions.find(token, signal);
      return session !== undefined && session.expiresAt > clock.now() ? session : undefined;
    } catch (error) {
      if (signal.aborted) throw error;
      logger.warn({ err: error }, 'Landing session lookup failed; falling back to the DOI');
      return undefined;
    }
  }

  async function access(article: Article, now: Date, signal: AbortSignal): Promise<LandingAccess> {
    try {
      const decision = await deps.entitlements.check(
        { doi: article.doi, isOpenAccess: article.isOpenAccess, caller: VISITOR },
        signal,
      );
      return {
        status: decision.status,
        ...(decision.loginUrl !== undefined && { loginUrl: decision.loginUrl }),
        ...(decision.purchaseUrl !== undefined && { purchaseUrl: decision.purchaseUrl }),
      };
    } catch (error) {
      if (signal.aborted) throw error;
      logger.warn({ err: error }, 'Entitlement check failed; showing access from the record');
      return { status: cardAccess(article, now) };
    }
  }

  async function related(article: Article, exclude: ReadonlySet<Doi>, signal: AbortSignal) {
    try {
      const result = await deps.search.related(
        { doi: article.doi, limit: Math.min(10, LANDING_RELATED_LIMIT + exclude.size) },
        signal,
      );
      return result.hits
        .map((hit) => hit.article)
        .filter(({ doi }) => !exclude.has(doi))
        .slice(0, LANDING_RELATED_LIMIT);
    } catch (error) {
      if (signal.aborted) throw error;
      logger.warn({ err: error }, 'Related reading failed; the page goes without it');
      return [];
    }
  }

  return {
    async recordVisit(token, signal) {
      if ((await activeSession(token, signal)) === undefined) return false;
      try {
        await sessions.recordVisit(token, signal);
        return true;
      } catch (error) {
        if (signal.aborted) throw error;
        logger.warn({ err: error }, 'Landing visit not recorded');
        return false;
      }
    },
    async resolve({ token, doi }, signal) {
      const session = token === undefined ? undefined : await activeSession(token, signal);
      const results = session?.results ?? [];
      const wanted = doi ?? results[0]?.doi;
      if (wanted === undefined) return undefined;

      const found = await reader.findManyByDoi(
        [wanted, ...results.map((result) => result.doi).filter((each) => each !== wanted)],
        signal,
      );
      const byDoi = new Map(found.map((article) => [article.doi, article]));
      // A collection link whose first result left the index opens the next one instead.
      const chosen = byDoi.get(wanted) ?? (doi === undefined ? found[0] : undefined);
      if (chosen === undefined) return undefined;

      const others = results.flatMap(({ doi: each }) => {
        const article = byDoi.get(each);
        return article === undefined || article.doi === chosen.doi ? [] : [article];
      });
      const chunkId = results.find((result) => result.doi === chosen.doi)?.matchedChunkId;
      const now = clock.now();
      const [chunks, decision, nearby] = await Promise.all([
        chunkId === undefined ? Promise.resolve([]) : reader.findChunks([chunkId], signal),
        access(chosen, now, signal),
        related(chosen, new Set(results.map((result) => result.doi)), signal),
      ]);
      const passage = matchedPassage(chunks[0]);

      return {
        session: session !== undefined ? 'active' : token !== undefined ? 'unavailable' : 'none',
        language: pageLanguage(session, chosen),
        topics: landingTopics(chosen, others),
        chosen: landingArticle(chosen, now),
        access: decision,
        ...(passage !== undefined && { matchedPassage: passage }),
        matches: others.map((article) => landingSummary(article, now)),
        related: nearby.map((article) => landingSummary(article, now)),
      };
    },
  };
}

/** The search's language when it was clear, else the chosen article's, else English. */
function pageLanguage(session: LandingSession | undefined, chosen: Article): 'de' | 'en' {
  if (session !== undefined && session.language !== 'any') return session.language;
  return chosen.language === 'de' ? 'de' : 'en';
}
