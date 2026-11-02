import type { ErrorCode } from './error-code.js';

/** Extra facts a caller can act on, kept separate from the human-readable message. */
export interface AppErrorDetails {
  /** The input field that was wrong, for `INVALID_INPUT`. */
  readonly field?: string;
  /** Seconds until a retry can succeed, for `RATE_LIMITED`. */
  readonly retryAfterSeconds?: number;
  /** The low-level error this one translates, kept for logs and never shown to a model. */
  readonly cause?: unknown;
}

/** The single error type of the app: a stable code plus a message safe to show a model. */
export type AppError = Error & {
  readonly name: 'AppError';
  readonly code: ErrorCode;
  readonly field?: string;
  readonly retryAfterSeconds?: number;
};

/**
 * Creates an AppError. Adapters call this to translate low-level failures, so nothing above
 * them needs to know about HTTP statuses or SQLite error codes.
 */
export function appError(
  code: ErrorCode,
  message: string,
  details: AppErrorDetails = {},
): AppError {
  const { cause, ...facts } = details;
  const error = new Error(message, cause === undefined ? undefined : { cause });
  return Object.assign(error, { name: 'AppError' as const, code, ...facts });
}

/** Narrows an unknown thrown value to an AppError. */
export function isAppError(value: unknown): value is AppError {
  return value instanceof Error && value.name === 'AppError' && 'code' in value;
}
