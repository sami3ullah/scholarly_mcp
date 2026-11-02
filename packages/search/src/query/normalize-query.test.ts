import { isAppError } from '@scholarly-mcp/core';
import { describe, expect, it } from 'vitest';
import { QUERY_MAX_LENGTH, normalizeQuery } from './normalize-query.js';

describe('normalizeQuery', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeQuery('  atrial \n\t fibrillation  ')).toBe('atrial fibrillation');
  });

  it('turns NFD umlauts into NFC', () => {
    expect(normalizeQuery('Ärzte')).toBe('Ärzte');
  });

  it('strips soft hyphens, zero-width and control characters', () => {
    expect(normalizeQuery('Vorhof­flimmern​\u0007')).toBe('Vorhofflimmern');
  });

  it('caps the query at 500 characters', () => {
    expect(normalizeQuery('a'.repeat(QUERY_MAX_LENGTH + 20))).toHaveLength(QUERY_MAX_LENGTH);
  });

  it('never splits a character made of two code units when capping', () => {
    const query = normalizeQuery(`${'a'.repeat(QUERY_MAX_LENGTH - 1)}😀😀`);
    expect(Array.from(query)).toHaveLength(QUERY_MAX_LENGTH);
    expect(query.endsWith('😀')).toBe(true);
  });

  it.each([[''], ['   '], ['­​'], ['?!* ()']])(
    'rejects %j as INVALID_INPUT on the query field',
    (raw) => {
      let caught: unknown;
      try {
        normalizeQuery(raw);
      } catch (error) {
        caught = error;
      }
      expect(isAppError(caught) && caught.code === 'INVALID_INPUT' && caught.field).toBe('query');
    },
  );

  it('accepts a one-character query', () => {
    expect(normalizeQuery(' x ')).toBe('x');
  });
});
