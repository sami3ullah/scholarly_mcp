import type { ApiKey, ApiKeyId, ApiKeyStore } from '@scholarly-mcp/core';
import { settle } from './settle.js';

/** Creates an in-memory API key store, optionally seeded with keys. */
export function createInMemoryApiKeyStore(seed: readonly ApiKey[] = []): ApiKeyStore {
  const keys = new Map<ApiKeyId, ApiKey>(seed.map((key) => [key.id, key]));
  return {
    find: (id, signal) => settle(signal, () => keys.get(id)),
    create: (key, signal) =>
      settle(signal, () => {
        if (keys.has(key.id)) throw new Error(`API key ${key.id} already exists`);
        keys.set(key.id, key);
      }),
    revoke: (id, at, signal) =>
      settle(signal, () => {
        const key = keys.get(id);
        if (key === undefined || key.revokedAt !== undefined) return false;
        keys.set(id, { ...key, revokedAt: at });
        return true;
      }),
    list: (signal) =>
      settle(signal, () =>
        [...keys.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      ),
  };
}
