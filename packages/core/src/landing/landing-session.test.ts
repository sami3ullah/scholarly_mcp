import { describe, expect, it } from 'vitest';
import { LANDING_SESSION_TTL_MS, landingSessionSchema } from './landing-session.js';
import { tokenSchema } from './token.js';

const createdAt = new Date('2026-11-02T10:00:00Z');
const valid = {
  token: 'AAAAAAAAAAAAAAAAAAAAAA',
  results: [{ doi: '10.1055/A-1', matchedChunkId: '10.1055/a-1#2' }, { doi: '10.1055/a-2' }],
  language: 'de',
  createdAt,
  expiresAt: new Date(createdAt.getTime() + LANDING_SESSION_TTL_MS),
  visitCount: 0,
};

describe('landingSessionSchema', () => {
  it('accepts a session and normalises result DOIs', () => {
    expect(landingSessionSchema.parse(valid).results[0]?.doi).toBe('10.1055/a-1');
  });

  it('rejects a session that expires before it is created', () => {
    const result = landingSessionSchema.safeParse({ ...valid, expiresAt: createdAt });
    expect(result.error?.issues[0]?.path).toEqual(['expiresAt']);
  });

  it.each([
    ['no results', { results: [] }],
    ['more than ten results', { results: Array.from({ length: 11 }, () => ({ doi: '10.1/x' })) }],
  ])('rejects %s', (_case, override) => {
    expect(landingSessionSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it('drops query text instead of storing it', () => {
    expect(landingSessionSchema.parse({ ...valid, query: 'Vorhofflimmern' })).not.toHaveProperty(
      'query',
    );
  });
});

describe('tokenSchema', () => {
  it.each(['short', 'AAAAAAAAAAAAAAAAAAAAA=', 'AAAAAAAAAAAAAAAAAAAAA/', ''])(
    'rejects %j',
    (value) => {
      expect(tokenSchema.safeParse(value).success).toBe(false);
    },
  );

  it('accepts base64url characters', () => {
    expect(tokenSchema.safeParse('abcXYZ019_-abcXYZ019_-').success).toBe(true);
  });
});
