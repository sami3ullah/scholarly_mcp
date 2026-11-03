import { OAuthError } from '@modelcontextprotocol/server';
import type { ApiKey, ApiKeyStore } from '@scholarly-mcp/core';
import {
  createFakeClock,
  createInMemoryApiKeyStore,
  createTestLogger,
} from '@scholarly-mcp/testkit';
import { describe, expect, it } from 'vitest';
import { generateApiKey, hashApiKeySecret, secretMatches } from './api-key-secrets.js';
import { callerOf } from './auth-info.js';
import { createApiKeyVerifier } from './create-api-key-verifier.js';

const signal = new AbortController().signal;

function setup(extra: Partial<ApiKey> = {}) {
  const clock = createFakeClock(new Date('2026-11-03T10:00:00Z'));
  const made = generateApiKey();
  const store = createInMemoryApiKeyStore([
    { id: made.id, label: 'demo', secretHash: made.secretHash, createdAt: clock.now(), ...extra },
  ]);
  let lookups = 0;
  const counting: Pick<ApiKeyStore, 'find'> = {
    find: (id, s) => {
      lookups += 1;
      return store.find(id, s);
    },
  };
  const verifier = createApiKeyVerifier({
    keys: counting,
    clock,
    logger: createTestLogger(),
    cacheMs: 5000,
  });
  return { clock, made, store, verifier, lookups: () => lookups };
}

describe('generateApiKey', () => {
  it('makes distinct keys whose stored hash matches only their own secret', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).toMatch(/^smk_key_[a-z2-7]{12}_[A-Za-z0-9_-]{43}$/);
    expect(a.id).not.toBe(b.id);
    // The secret is base64url, which may itself contain `_`.
    const secretOf = (key: string) => key.slice(-43);
    expect(secretMatches(secretOf(a.key), a.secretHash)).toBe(true);
    expect(secretMatches(secretOf(b.key), a.secretHash)).toBe(false);
    expect(a.secretHash).toBe(hashApiKeySecret(secretOf(a.key)));
    expect(a.secretHash).not.toContain(secretOf(a.key));
  });
});

describe('createApiKeyVerifier', () => {
  it('accepts a valid key and names the caller by key id and institution', async () => {
    const { made, verifier } = setup({ institutionId: 'uni-1' });
    const info = await verifier.verifyAccessToken(made.key);
    expect(callerOf(info)).toEqual({ apiKeyId: made.id, institutionId: 'uni-1' });
    expect(info.clientId).toBe(made.id);
    expect(info.expiresAt).toBeGreaterThan(Date.parse('2026-11-03T10:00:00Z') / 1000);
  });

  it.each([
    ['a malformed key', 'not-a-key'],
    ['an unknown id', `smk_key_aaaaaaaaaaaa_${'A'.repeat(43)}`],
  ])('refuses %s', async (_label, token) => {
    const { verifier } = setup();
    await expect(verifier.verifyAccessToken(token)).rejects.toThrow(OAuthError);
  });

  it('refuses a known id with the wrong secret', async () => {
    const { made, verifier } = setup();
    const wrong = `${made.key.slice(0, -43)}${'B'.repeat(43)}`;
    await expect(verifier.verifyAccessToken(wrong)).rejects.toMatchObject({
      code: 'invalid_token',
    });
  });

  it('reuses decisions for the cache time, so a revoked key stops within seconds', async () => {
    const { clock, made, store, verifier, lookups } = setup();
    await verifier.verifyAccessToken(made.key);
    await store.revoke(made.id, clock.now(), signal);
    await verifier.verifyAccessToken(made.key);
    expect(lookups()).toBe(1);
    clock.advance(5001);
    await expect(verifier.verifyAccessToken(made.key)).rejects.toMatchObject({
      code: 'invalid_token',
    });
    expect(lookups()).toBe(2);
  });

  it('caches refusals too, so a flood of bad keys does not reach the store', async () => {
    const { verifier, lookups } = setup();
    const unknown = `smk_key_aaaaaaaaaaaa_${'A'.repeat(43)}`;
    await expect(verifier.verifyAccessToken(unknown)).rejects.toThrow();
    await expect(verifier.verifyAccessToken(unknown)).rejects.toThrow();
    expect(lookups()).toBe(1);
  });

  it('answers a server error, uncached, when the store fails', async () => {
    const clock = createFakeClock();
    const made = generateApiKey();
    let fail = true;
    const verifier = createApiKeyVerifier({
      keys: {
        find: () =>
          fail
            ? Promise.reject(new Error('SQLITE_BUSY'))
            : Promise.resolve({
                id: made.id,
                label: 'demo',
                secretHash: made.secretHash,
                createdAt: clock.now(),
              }),
      },
      clock,
      logger: createTestLogger(),
      cacheMs: 5000,
    });
    await expect(verifier.verifyAccessToken(made.key)).rejects.toMatchObject({
      code: 'server_error',
    });
    fail = false;
    await expect(verifier.verifyAccessToken(made.key)).resolves.toMatchObject({
      clientId: made.id,
    });
  });
});
