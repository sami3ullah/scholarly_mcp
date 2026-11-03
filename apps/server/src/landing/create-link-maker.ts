import {
  LANDING_SESSION_TTL_MS,
  buildLandingUrl,
  type Caller,
  type Clock,
  type Doi,
  type LandingSession,
  type Logger,
  type RandomToken,
  type SessionStore,
  type Token,
  type ToolName,
} from '@scholarly-mcp/core';

/** The links of one tool response. */
export interface LandingLinks {
  /** The landing link for one result. */
  article(doi: Doi): string;
  /** One page with all results; absent without results or when no session could be stored. */
  readonly collectionUrl?: string;
}

/** What a set of links is made for. Never query text (key design decision 12). */
export interface LinkRequest {
  readonly tool: ToolName;
  readonly language: LandingSession['language'];
  readonly results: readonly { readonly doi: Doi; readonly matchedChunkId?: string }[];
  readonly caller: Caller;
}

/** Makes landing links, storing the session they point to. */
export interface LinkMaker {
  links(request: LinkRequest, signal: AbortSignal): Promise<LandingLinks>;
}

export interface LinkMakerDeps {
  readonly baseUrl: string;
  readonly sessions: SessionStore;
  readonly tokens: RandomToken;
  readonly clock: Clock;
  readonly logger: Logger;
}

/**
 * Stores each response's results under a fresh random token for 24 h and puts the token in
 * every link (PLAN.md query pipeline step 8). If the session store fails, the links go
 * without a token, so the landing page falls back to the article by its DOI: a side system
 * never fails the request.
 */
export function createLinkMaker(deps: LinkMakerDeps): LinkMaker {
  const { baseUrl, sessions, tokens, clock, logger } = deps;
  return {
    async links(request, signal) {
      const { tool } = request;
      const token = await storeSession(request, signal);
      const article = (doi: Doi) =>
        buildLandingUrl({ baseUrl, tool, doi, ...(token !== undefined && { token }) });
      return token === undefined
        ? { article }
        : { article, collectionUrl: buildLandingUrl({ baseUrl, tool, token }) };
    },
  };

  async function storeSession(
    request: LinkRequest,
    signal: AbortSignal,
  ): Promise<Token | undefined> {
    if (request.results.length === 0) return undefined;
    const token = tokens.next();
    const createdAt = clock.now();
    try {
      await sessions.save(
        {
          token,
          results: request.results.map(({ doi, matchedChunkId }) => ({
            doi,
            ...(matchedChunkId !== undefined && { matchedChunkId }),
          })),
          language: request.language,
          tool: request.tool,
          apiKeyId: request.caller.apiKeyId,
          createdAt,
          expiresAt: new Date(createdAt.getTime() + LANDING_SESSION_TTL_MS),
          visitCount: 0,
        },
        signal,
      );
      return token;
    } catch (error) {
      if (signal.aborted) throw error;
      logger.warn(
        { tool: request.tool, reason: error instanceof Error ? error.message : String(error) },
        'Landing session not stored; links fall back to the DOI',
      );
      return undefined;
    }
  }
}
