import 'server-only';
import { createHash } from 'node:crypto';
import type { Logger } from '@scholarly-mcp/core';
import type { LandingEnv } from '../../../shared/lib/env';

/** What calls to the landing API need; tests pass a fake `fetch`. */
export interface LandingApiDeps {
  readonly env: LandingEnv;
  /** The reader's address as the proxy reports it, for the per-visitor rate limit. */
  readonly clientAddress?: string;
  readonly fetch: typeof fetch;
  readonly logger: Logger;
}

/** The header the landing API reads the visitor id from (server `VISITOR_HEADER`). */
const VISITOR_HEADER = 'x-landing-visitor';

/**
 * Headers for a landing API call: the shared secret, and a visitor id for the rate limit.
 * The id is a salted hash of the reader's address, so the API never receives the address.
 */
export function apiHeaders(deps: Pick<LandingApiDeps, 'env' | 'clientAddress'>) {
  const headers: Record<string, string> = { accept: 'application/json' };
  const secret = deps.env.LANDING_API_SECRET;
  if (secret !== undefined) headers['authorization'] = `Bearer ${secret}`;
  if (deps.clientAddress !== undefined) {
    headers[VISITOR_HEADER] = createHash('sha256')
      .update(`${secret ?? 'scholarly-mcp-landing'}:${deps.clientAddress}`)
      .digest('base64url')
      .slice(0, 32);
  }
  return headers;
}

/** The reader's address from proxy headers: the first `x-forwarded-for` hop, else `x-real-ip`. */
export function clientAddress(headers: Pick<Headers, 'get'>): string | undefined {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded !== undefined && forwarded !== ''
    ? forwarded
    : (headers.get('x-real-ip') ?? undefined);
}
