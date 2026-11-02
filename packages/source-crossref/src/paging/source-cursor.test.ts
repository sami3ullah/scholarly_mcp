import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from './source-cursor.js';

describe('source cursor', () => {
  it('round-trips a state', () => {
    const state = {
      crossref: 'DnF1ZXJ5VGhlbkZldGNo+/=',
      from: new Date('2026-10-30T00:00:00Z'),
      watermark: new Date('2026-10-30T08:02:00Z'),
    };
    expect(decodeCursor(encodeCursor(state))).toEqual(state);
  });

  it('round-trips a state without dates', () => {
    expect(decodeCursor(encodeCursor({ crossref: '*' }))).toEqual({ crossref: '*' });
  });

  it('is URL-safe', () => {
    expect(encodeCursor({ crossref: '+/+/??&&' })).toMatch(/^[\w-]+$/);
  });

  it.each(['', 'not-base64-json', Buffer.from('{"v":2,"crossref":"x"}').toString('base64url')])(
    'rejects the unknown cursor %j as invalid input',
    (cursor) => {
      expect(() => decodeCursor(cursor)).toThrow(
        expect.objectContaining({ code: 'INVALID_INPUT' }),
      );
    },
  );
});
