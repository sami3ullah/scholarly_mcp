import { z } from 'zod';

/**
 * Tool-call rate limits (ADR 0031, ADR 0048). Callers are anonymous, so each client address
 * has a token bucket of `RATE_LIMIT_PER_MINUTE` tool calls a minute, in bursts of
 * `RATE_LIMIT_BURST`.
 */
export const limitsConfigSchema = z.object({
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1_000_000).default(60),
  RATE_LIMIT_BURST: z.coerce.number().int().min(1).max(100_000).default(20),
});
