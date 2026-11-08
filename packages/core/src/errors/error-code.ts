import { z } from 'zod';

/**
 * Stable error codes. The tool layer maps them to model-facing messages in one place.
 * `SOURCE_UNAVAILABLE` is raised by ingestion only: a content source kept failing after retries.
 */
export const errorCodeSchema = z.enum([
  'INVALID_INPUT',
  'NOT_FOUND',
  'CURSOR_STALE',
  'RATE_LIMITED',
  'TIMEOUT',
  'INDEX_UNAVAILABLE',
  'SOURCE_UNAVAILABLE',
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;
