import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { API_KEY_PREFIX, apiKeyIdSchema, type ApiKeyId } from '@scholarly-mcp/core';

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** A freshly made key: the string handed out once, and what is stored instead of it. */
export interface NewApiKey {
  readonly id: ApiKeyId;
  readonly secretHash: string;
  /** `smk_<id>_<secret>`: shown once, never stored. */
  readonly key: string;
}

/**
 * Makes an API key from the OS's CSPRNG: a 60-bit public id and a 256-bit secret. The
 * secret is random enough that a fast hash is safe; a slow password hash would only make
 * every request slower.
 */
export function generateApiKey(random: (size: number) => Buffer = randomBytes): NewApiKey {
  // 256 is a multiple of 32, so taking each byte modulo 32 is unbiased.
  const id = apiKeyIdSchema.parse(
    `key_${[...random(12)].map((byte) => BASE32.charAt(byte % 32)).join('')}`,
  );
  const secret = random(32).toString('base64url');
  return { id, secretHash: hashApiKeySecret(secret), key: `${API_KEY_PREFIX}${id}_${secret}` };
}

/** The stored form of a key's secret: its SHA-256, as hex. */
export function hashApiKeySecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** Compares a presented secret with a stored hash in constant time. */
export function secretMatches(secret: string, secretHash: string): boolean {
  const presented = Buffer.from(hashApiKeySecret(secret), 'hex');
  const stored = Buffer.from(secretHash, 'hex');
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}
