import { describe, expect, it } from 'vitest';
import { decodeListCursor, encodeListCursor } from './list-cursor.js';

describe('list cursor', () => {
  it('round-trips an offset, URL-safe', () => {
    expect(decodeListCursor(encodeListCursor(40))).toBe(40);
    expect(encodeListCursor(40)).toMatch(/^[\w-]+$/);
  });

  it.each([
    '',
    'not-base64-json',
    Buffer.from('{"v":1,"offset":-1}').toString('base64url'),
    Buffer.from('{"v":1,"crossref":"*"}').toString('base64url'),
  ])('rejects the unknown cursor %j as invalid input', (cursor) => {
    expect(() => decodeListCursor(cursor)).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
  });
});
