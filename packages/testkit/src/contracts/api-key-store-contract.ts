import type { ApiKey, ApiKeyStore } from '@scholarly-mcp/core';
import { beforeEach, describe, expect, it } from 'vitest';

const signal = new AbortController().signal;

function aKey(id: string, createdAt: string, extra: Partial<ApiKey> = {}): ApiKey {
  return {
    id,
    label: `label of ${id}`,
    secretHash: 'ab'.repeat(32),
    createdAt: new Date(createdAt),
    ...extra,
  };
}

/** The behaviour every API key store must share. */
export function runApiKeyStoreContract(
  name: string,
  create: () => ApiKeyStore | Promise<ApiKeyStore>,
): void {
  describe(`${name} satisfies the API key store contract`, () => {
    let store: ApiKeyStore;
    beforeEach(async () => {
      store = await create();
    });

    it('returns undefined for an unknown id', async () => {
      expect(await store.find('key_aaaaaaaaaaaa', signal)).toBeUndefined();
    });

    it('returns a created key unchanged, with and without optional fields', async () => {
      const plain = aKey('key_aaaaaaaaaaaa', '2026-11-01T00:00:00Z');
      const full = aKey('key_bbbbbbbbbbbb', '2026-11-02T00:00:00Z', { institutionId: 'inst-1' });
      await store.create(plain, signal);
      await store.create(full, signal);
      expect(await store.find(plain.id, signal)).toEqual(plain);
      expect(await store.find(full.id, signal)).toEqual(full);
    });

    it('refuses to overwrite an existing id', async () => {
      const key = aKey('key_aaaaaaaaaaaa', '2026-11-01T00:00:00Z');
      await store.create(key, signal);
      await expect(store.create({ ...key, label: 'other' }, signal)).rejects.toThrow();
      expect((await store.find(key.id, signal))?.label).toBe(key.label);
    });

    it('revokes once, and reports unknown or already revoked keys', async () => {
      const key = aKey('key_aaaaaaaaaaaa', '2026-11-01T00:00:00Z');
      const at = new Date('2026-11-03T12:00:00Z');
      await store.create(key, signal);
      expect(await store.revoke(key.id, at, signal)).toBe(true);
      expect(await store.revoke(key.id, new Date(), signal)).toBe(false);
      expect(await store.revoke('key_cccccccccccc', at, signal)).toBe(false);
      expect(await store.find(key.id, signal)).toEqual({ ...key, revokedAt: at });
    });

    it('lists every key oldest first', async () => {
      await store.create(aKey('key_bbbbbbbbbbbb', '2026-11-02T00:00:00Z'), signal);
      await store.create(aKey('key_aaaaaaaaaaaa', '2026-11-01T00:00:00Z'), signal);
      expect((await store.list(signal)).map(({ id }) => id)).toEqual([
        'key_aaaaaaaaaaaa',
        'key_bbbbbbbbbbbb',
      ]);
    });

    it('rejects when the caller has already aborted', async () => {
      await expect(store.list(AbortSignal.abort())).rejects.toThrow();
    });
  });
}
