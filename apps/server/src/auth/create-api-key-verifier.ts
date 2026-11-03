import { createHash } from 'node:crypto';
import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
  type OAuthTokenVerifier,
} from '@modelcontextprotocol/server';
import { parseApiKey, type ApiKeyStore, type Clock, type Logger } from '@scholarly-mcp/core';
import { secretMatches } from './api-key-secrets.js';
import { withCaller } from './auth-info.js';
import { createBoundedCache } from './bounded-cache.js';

/** How long an accepted key's `AuthInfo` claims to be valid; the SDK requires an expiry. */
const NOMINAL_LIFETIME_S = 3600;

export interface ApiKeyVerifierDeps {
  readonly keys: Pick<ApiKeyStore, 'find'>;
  readonly clock: Clock;
  readonly logger: Logger;
  /** How long a decision, accepted or refused, is reused; seconds only (PLAN.md). */
  readonly cacheMs: number;
}

/**
 * Checks `Authorization: Bearer smk_…` keys against the key store. Decisions are cached by
 * the key's hash for `cacheMs`, so a revoked key stops working within that time. A store
 * failure is a server error and is not cached, so it never locks out a valid key.
 */
export function createApiKeyVerifier(deps: ApiKeyVerifierDeps): OAuthTokenVerifier {
  const cache = createBoundedCache<AuthInfo | 'refused'>(deps.cacheMs);
  const refuse = () => new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid or revoked API key');

  return {
    verifyAccessToken: async (token) => {
      const now = deps.clock.now().getTime();
      const cacheKey = createHash('sha256').update(token).digest('base64url');
      const cached = cache.get(cacheKey, now);
      if (cached === 'refused') throw refuse();
      if (cached !== undefined) return cached;

      const parsed = parseApiKey(token);
      let key;
      try {
        key = parsed && (await deps.keys.find(parsed.id, AbortSignal.timeout(2000)));
      } catch (error) {
        deps.logger.error({ err: error }, 'API key lookup failed');
        throw new OAuthError(OAuthErrorCode.ServerError, 'Authentication is unavailable');
      }
      if (
        parsed === undefined ||
        key === undefined ||
        key.revokedAt !== undefined ||
        !secretMatches(parsed.secret, key.secretHash)
      ) {
        cache.set(cacheKey, 'refused', now);
        throw refuse();
      }
      const info = withCaller(
        {
          token,
          clientId: key.id,
          scopes: [],
          expiresAt: Math.floor(now / 1000) + NOMINAL_LIFETIME_S,
        },
        {
          apiKeyId: key.id,
          ...(key.institutionId !== undefined && { institutionId: key.institutionId }),
        },
      );
      cache.set(cacheKey, info, now);
      return info;
    },
  };
}
