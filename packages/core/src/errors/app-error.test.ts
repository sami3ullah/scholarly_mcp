import { describe, expect, it } from 'vitest';
import { appError, isAppError } from './app-error.js';

describe('appError', () => {
  it('carries a stable code and the facts a caller acts on', () => {
    const error = appError('RATE_LIMITED', 'Quota exceeded', { retryAfterSeconds: 30 });
    expect(error).toMatchObject({ name: 'AppError', code: 'RATE_LIMITED', retryAfterSeconds: 30 });
    expect(error.message).toBe('Quota exceeded');
  });

  it('keeps the low-level cause for logs without adding it as a fact', () => {
    const cause = new Error('SQLITE_CORRUPT');
    const error = appError('INDEX_UNAVAILABLE', 'Index unavailable', { cause });
    expect(error.cause).toBe(cause);
    expect(Object.keys(error)).not.toContain('field');
  });

  it('names the wrong field for invalid input', () => {
    expect(appError('INVALID_INPUT', 'yearFrom is after yearTo', { field: 'yearFrom' }).field).toBe(
      'yearFrom',
    );
  });
});

describe('isAppError', () => {
  it.each([
    [appError('NOT_FOUND', 'No such DOI'), true],
    [new Error('plain'), false],
    [{ name: 'AppError', code: 'NOT_FOUND' }, false],
    ['NOT_FOUND', false],
    [undefined, false],
  ])('recognises %o as %s', (value, expected) => {
    expect(isAppError(value)).toBe(expected);
  });
});
