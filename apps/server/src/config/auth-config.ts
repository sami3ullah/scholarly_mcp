import { z } from 'zod';
import { csv } from './csv.js';

/**
 * Who may call the HTTP transport (ADR 0031). `AUTH_MODE=none` serves everyone as the local
 * caller and is only allowed on loopback; `api-key` checks keys made with
 * `scholarly-mcp keys create`; `oauth` validates JWT access tokens from the identity
 * provider in `OAUTH_ISSUER`, signed by a key in `OAUTH_JWKS_URL` and issued for
 * `OAUTH_AUDIENCE` (this server's public `/mcp` URL). The token bucket allows
 * `RATE_LIMIT_PER_MINUTE` tool calls a minute per caller, in bursts of `RATE_LIMIT_BURST`.
 */
export const authConfigSchema = z.object({
  AUTH_MODE: z.enum(['none', 'api-key', 'oauth']).default('none'),
  AUTH_CACHE_MS: z.coerce.number().int().min(0).max(60_000).default(5000),
  OAUTH_ISSUER: z.url({ protocol: /^https?$/ }).optional(),
  OAUTH_AUDIENCE: z.url({ protocol: /^https?$/ }).optional(),
  OAUTH_JWKS_URL: z.url({ protocol: /^https?$/ }).optional(),
  OAUTH_REQUIRED_SCOPES: csv(),
  OAUTH_INSTITUTION_CLAIM: z.string().min(1).max(100).optional(),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1_000_000).default(60),
  RATE_LIMIT_BURST: z.coerce.number().int().min(1).max(100_000).default(20),
});

export type AuthConfig = z.output<typeof authConfigSchema>;
