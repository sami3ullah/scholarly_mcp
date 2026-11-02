/** Structured fields attached to a log line. Never put query text or secrets in them. */
export type LogFields = Readonly<Record<string, unknown>>;

/**
 * The logging port: a pino-compatible subset, so core code can log without importing pino.
 */
export interface Logger {
  debug(fields: LogFields, message: string): void;
  info(fields: LogFields, message: string): void;
  warn(fields: LogFields, message: string): void;
  error(fields: LogFields, message: string): void;
  /** Returns a logger that adds `bindings` (e.g. a request id) to every line. */
  child(bindings: LogFields): Logger;
}
