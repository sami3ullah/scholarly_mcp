import 'server-only';
import { parseConfig } from '@scholarly-mcp/core';
import { loggingConfigSchema } from '@scholarly-mcp/logger';
import { z } from 'zod';

/**
 * The landing app's settings, validated on first use (ADR 0014). `LANDING_API_URL` is the
 * MCP server's HTTP address, `LANDING_API_SECRET` the bearer token its landing API expects
 * (required there beyond loopback), and `LANDING_API_TIMEOUT_MS` how long a page waits for it.
 */
export const landingEnvSchema = z
  .object({
    LANDING_API_URL: z.url({ protocol: /^https?$/ }).default('http://127.0.0.1:8080'),
    LANDING_API_SECRET: z
      .string()
      .min(32, 'LANDING_API_SECRET must be at least 32 characters')
      .optional(),
    LANDING_API_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(3000),
  })
  .extend(loggingConfigSchema.shape);

export type LandingEnv = z.output<typeof landingEnvSchema>;

let cached: LandingEnv | undefined;

/** The validated settings; a bad value fails the first request with a clear message. */
export function landingEnv(): LandingEnv {
  cached ??= parseConfig(landingEnvSchema, process.env);
  return cached;
}
