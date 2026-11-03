import 'server-only';
import type { Logger } from '@scholarly-mcp/core';
import { createLogger } from '@scholarly-mcp/logger';
import { landingEnv } from '../../../shared/lib/env';
import { clientAddress, type LandingApiDeps } from './landing-api';

let logger: Logger | undefined;

/** The real dependencies of a landing API call made for this request. */
export function landingApiDeps(requestHeaders: Pick<Headers, 'get'>): LandingApiDeps {
  const address = clientAddress(requestHeaders);
  const env = landingEnv();
  logger ??= createLogger({ name: 'landing', level: env.LOG_LEVEL });
  return {
    env,
    fetch,
    logger,
    ...(address !== undefined && { clientAddress: address }),
  };
}
