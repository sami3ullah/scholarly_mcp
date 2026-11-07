import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/server';
import type { ApiKeyStore, Clock, Logger } from '@scholarly-mcp/core';
import { createRemoteJWKSet } from 'jose';
import type { AuthConfig } from '../config/auth-config.js';
import type { HttpAuth } from '../http/create-http-handler.js';
import { createApiKeyOrJwtVerifier } from './create-api-key-or-jwt-verifier.js';
import { createApiKeyVerifier } from './create-api-key-verifier.js';
import { createJwtVerifier } from './create-jwt-verifier.js';

export interface HttpAuthDeps {
  readonly keys: Pick<ApiKeyStore, 'find'>;
  readonly clock: Clock;
  readonly logger: Logger;
}

/**
 * Turns `AUTH_MODE` into the HTTP layer's auth. In OAuth modes the server also publishes
 * RFC 9728 Protected Resource Metadata naming the issuer, so MCP clients can find the
 * identity provider from the `401` challenge, as the MCP authorization spec describes.
 * `api-key+oauth` accepts both kinds of token (ADR 0047).
 */
export function httpAuthFromConfig(config: AuthConfig, deps: HttpAuthDeps): HttpAuth {
  if (config.AUTH_MODE === 'none') return { mode: 'none' };
  const apiKeys = createApiKeyVerifier({ ...deps, cacheMs: config.AUTH_CACHE_MS });
  if (config.AUTH_MODE === 'api-key') return { mode: 'bearer', verifier: apiKeys };

  const { OAUTH_ISSUER: issuer, OAUTH_AUDIENCE: audience, OAUTH_JWKS_URL: jwks } = config;
  if (issuer === undefined || audience === undefined || jwks === undefined) {
    throw new Error(
      `AUTH_MODE ${config.AUTH_MODE} needs OAUTH_ISSUER, OAUTH_AUDIENCE and OAUTH_JWKS_URL`,
    );
  }
  const scopes = config.OAUTH_REQUIRED_SCOPES;
  const jwt = createJwtVerifier({
    issuer,
    audience,
    keys: createRemoteJWKSet(new URL(jwks), { timeoutDuration: 5000 }),
    ...(config.OAUTH_INSTITUTION_CLAIM !== undefined && {
      institutionClaim: config.OAUTH_INSTITUTION_CLAIM,
    }),
    clock: deps.clock,
    logger: deps.logger,
  });
  return {
    mode: 'bearer',
    verifier:
      config.AUTH_MODE === 'oauth'
        ? jwt
        : createApiKeyOrJwtVerifier({ apiKeys, jwt, resource: new URL(audience), scopes }),
    expectedResource: new URL(audience),
    ...(scopes.length > 0 && { requiredScopes: scopes }),
    protectedResource: {
      url: new URL(getOAuthProtectedResourceMetadataUrl(new URL(audience))),
      document: {
        resource: audience,
        authorization_servers: [issuer],
        bearer_methods_supported: ['header'],
        ...(scopes.length > 0 && { scopes_supported: scopes }),
        resource_name: 'scholarly-mcp',
      },
    },
  };
}
