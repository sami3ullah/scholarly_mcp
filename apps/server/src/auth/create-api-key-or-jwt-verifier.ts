import type { OAuthTokenVerifier } from '@modelcontextprotocol/server';

/** Every API key starts with this; a JWT never does (it starts with its base64url header). */
const API_KEY_PREFIX = 'smk_';

export interface ApiKeyOrJwtVerifierDeps {
  readonly apiKeys: OAuthTokenVerifier;
  readonly jwt: OAuthTokenVerifier;
  /** This server's resource identifier, `OAUTH_AUDIENCE`. */
  readonly resource: URL;
  /** `OAUTH_REQUIRED_SCOPES`. */
  readonly scopes: readonly string[];
}

/**
 * `AUTH_MODE=api-key+oauth` (ADR 0047): `smk_…` tokens go to the key store and everything
 * else to the JWT check, so each token meets exactly one verifier and a refusal comes from
 * the one that owns its format. An API key is a credential the operator issued for this
 * server, so an accepted key is reported for this resource with every required scope; the
 * shared resource and scope checks then pass for keys and still apply in full to JWTs.
 */
export function createApiKeyOrJwtVerifier(deps: ApiKeyOrJwtVerifierDeps): OAuthTokenVerifier {
  return {
    verifyAccessToken: async (token) => {
      if (!token.startsWith(API_KEY_PREFIX)) return deps.jwt.verifyAccessToken(token);
      const info = await deps.apiKeys.verifyAccessToken(token);
      return { ...info, resource: deps.resource, scopes: [...deps.scopes] };
    },
  };
}
