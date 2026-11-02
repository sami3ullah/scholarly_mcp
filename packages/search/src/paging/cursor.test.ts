import { isAppError } from '@scholarly-mcp/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from './cursor.js';

const codeOf = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return isAppError(error) ? error.code : 'not an AppError';
  }
  return 'no error';
};

describe('cursor', () => {
  it('round-trips offset and index version', () => {
    const cursor = encodeCursor({ offset: 5, indexVersion: '2026-11-02T10:00:00.000Z-ä' });
    expect(decodeCursor(cursor, '2026-11-02T10:00:00.000Z-ä')).toBe(5);
  });

  it('is URL-safe and does not show its contents', () => {
    const cursor = encodeCursor({ offset: 10, indexVersion: 'v1' });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(cursor).not.toContain('v1');
  });

  it('is CURSOR_STALE after the index was swapped', () => {
    const cursor = encodeCursor({ offset: 5, indexVersion: 'v1' });
    expect(codeOf(() => decodeCursor(cursor, 'v2'))).toBe('CURSOR_STALE');
  });

  it.each([
    ['garbage'],
    [''],
    [encodeCursor({ offset: -1, indexVersion: 'v1' })],
    [encodeCursor({ offset: 0, indexVersion: 'v1' })],
    [encodeCursor({ offset: 1.5, indexVersion: 'v1' })],
    [encodeCursor({ offset: 10_001, indexVersion: 'v1' })],
    [btoa('{"o":5}')],
    [btoa('[5]')],
  ])('rejects %j as INVALID_INPUT', (cursor) => {
    expect(codeOf(() => decodeCursor(cursor, 'v1'))).toBe('INVALID_INPUT');
  });

  it('only ever throws AppErrors for any string', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (cursor) => {
        expect(['INVALID_INPUT', 'CURSOR_STALE', 'no error']).toContain(
          codeOf(() => decodeCursor(cursor, 'v1')),
        );
      }),
    );
  });
});
