import { describe, expect, it } from 'vitest';
import { apiKeySchema, parseApiKey } from './api-key.js';

const secret = 'A'.repeat(43);

describe('parseApiKey', () => {
  it('splits a well-formed key into id and secret', () => {
    expect(parseApiKey(`smk_key_abcdefgh2345_${secret}`)).toEqual({
      id: 'key_abcdefgh2345',
      secret,
    });
  });

  it.each([
    ['no prefix', `key_abcdefgh2345_${secret}`],
    ['short secret', 'smk_key_abcdefgh2345_abc'],
    ['upper-case id', `smk_key_ABCDEFGH2345_${secret}`],
    ['trailing text', `smk_key_abcdefgh2345_${secret}x`],
    ['empty', ''],
  ])('rejects a key with %s', (_label, raw) => {
    expect(parseApiKey(raw)).toBeUndefined();
  });
});

describe('apiKeySchema', () => {
  it('holds a hash, never a secret field', () => {
    const parsed = apiKeySchema.parse({
      id: 'key_abcdefgh2345',
      label: 'demo',
      secretHash: 'a'.repeat(64),
      createdAt: new Date('2026-11-03T00:00:00Z'),
      secret,
    });
    expect(parsed).not.toHaveProperty('secret');
  });
});
