import type { Logger } from '@scholarly-mcp/core';
import { pino, type DestinationStream } from 'pino';
import type { LoggingConfig } from './logging-config.js';

/**
 * Field names whose values never reach a log line: query text (a clinician may type patient
 * details) and anything secret. Pino matches these at the top level and one level down.
 */
const REDACTED_FIELDS = [
  'query',
  'q',
  'text',
  'authorization',
  'cookie',
  'apiKey',
  'token',
  'secret',
  'password',
];

export const REDACT_PATHS = [
  ...REDACTED_FIELDS,
  ...REDACTED_FIELDS.map((field) => `*.${field}`),
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
];

/** Options for {@link createLogger}. */
export interface CreateLoggerOptions {
  readonly name: string;
  readonly level: LoggingConfig['LOG_LEVEL'];
  /** Where lines go; stdout when omitted. Tests pass an in-memory stream. */
  readonly destination?: DestinationStream;
}

/** Creates the app's structured JSON logger with query text and secrets redacted. */
export function createLogger(options: CreateLoggerOptions): Logger {
  return pino(
    {
      name: options.name,
      level: options.level,
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    },
    options.destination,
  );
}
