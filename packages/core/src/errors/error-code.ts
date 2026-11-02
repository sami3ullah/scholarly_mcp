import { z } from 'zod';

/** Stable error codes. The tool layer maps them to model-facing messages in one place. */
export const errorCodeSchema = z.enum([
  'INVALID_INPUT',
  'NOT_FOUND',
  'CURSOR_STALE',
  'RATE_LIMITED',
  'UNAUTHORIZED',
  'TIMEOUT',
  'INDEX_UNAVAILABLE',
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;
