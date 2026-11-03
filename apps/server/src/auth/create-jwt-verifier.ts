import { OAuthError, OAuthErrorCode, type OAuthTokenVerifier } from '@modelcontextprotocol/server';
import type { Clock, Logger } from '@scholarly-mcp/core';
import { errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { withCaller } from './auth-info.js';

/** Signature algorithms accepted; symmetric ones would let anyone with the key mint tokens. */
const ALGORITHMS = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'EdDSA',
];

export interface JwtVerifierDeps {
  readonly issuer: string;
  /** This server's resource identifier; the token's `aud` must contain it (RFC 8707). */
  readonly audience: string;
  /** Resolves the signing key, normally `createRemoteJWKSet(OAUTH_JWKS_URL)`. */
  readonly keys: JWTVerifyGetKey;
  /** A string claim naming the reader's institution, passed on to entitlements. */
  readonly institutionClaim?: string;
  readonly clock: Clock;
  readonly logger: Logger;
}

/**
 * OAuth 2.1 resource-server mode (PLAN.md security): validates JWT access tokens from the
 * identity provider, checking signature, issuer, audience and expiry. The token is never
 * passed upstream. The caller is `oauth:<client id>`, so metering and sessions name the
 * client, not the person.
 */
export function createJwtVerifier(deps: JwtVerifierDeps): OAuthTokenVerifier {
  return {
    verifyAccessToken: async (token) => {
      let payload: JWTPayload;
      try {
        ({ payload } = await jwtVerify(token, deps.keys, {
          issuer: deps.issuer,
          audience: deps.audience,
          algorithms: ALGORITHMS,
          requiredClaims: ['exp'],
          clockTolerance: 30,
          currentDate: deps.clock.now(),
        }));
      } catch (error) {
        throw toOAuthError(error, deps.logger);
      }
      const clientId =
        stringClaim(payload, 'client_id') ?? stringClaim(payload, 'azp') ?? payload.sub;
      if (clientId === undefined || payload.exp === undefined) {
        throw new OAuthError(OAuthErrorCode.InvalidToken, 'Token names no client');
      }
      const institution =
        deps.institutionClaim === undefined
          ? undefined
          : stringClaim(payload, deps.institutionClaim);
      return withCaller(
        {
          token,
          clientId,
          scopes: scopesOf(payload),
          expiresAt: payload.exp,
          resource: new URL(deps.audience),
        },
        {
          apiKeyId: `oauth:${clientId}`,
          ...(institution !== undefined && { institutionId: institution }),
        },
      );
    },
  };
}

/** A key-set outage is the server's problem; anything else wrong with the token is the client's. */
function toOAuthError(error: unknown, logger: Logger): OAuthError {
  if (error instanceof errors.JOSEError && !(error instanceof errors.JWKSTimeout)) {
    return new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid or expired access token');
  }
  logger.error({ err: error }, 'Access token verification failed');
  return new OAuthError(OAuthErrorCode.ServerError, 'Authentication is unavailable');
}

function stringClaim(payload: JWTPayload, name: string): string | undefined {
  const value = payload[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** Scopes from `scope` (space-separated, RFC 8693) or `scp` (a list, as some IdPs send). */
function scopesOf(payload: JWTPayload): string[] {
  const { scope, scp } = payload as { scope?: unknown; scp?: unknown };
  if (typeof scope === 'string') return scope.split(' ').filter((item) => item !== '');
  if (Array.isArray(scp)) return scp.filter((item): item is string => typeof item === 'string');
  return [];
}
