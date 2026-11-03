import { z } from 'zod';

/** The public part of an API key: `key_` and 12 lowercase base32 characters. */
export const apiKeyIdSchema = z.string().regex(/^key_[a-z2-7]{12}$/, 'Not an API key id');
export type ApiKeyId = z.infer<typeof apiKeyIdSchema>;

/**
 * A stored API key (PLAN.md security: keys stored hashed, identified by prefix). The secret
 * is never stored, only its SHA-256 hash; the id is the prefix every log, landing session
 * and usage event names the caller by.
 */
export const apiKeySchema = z.object({
  id: apiKeyIdSchema,
  label: z.string().min(1).max(100),
  secretHash: z.string().regex(/^[0-9a-f]{64}$/, 'Not a SHA-256 hex digest'),
  institutionId: z.string().min(1).max(100).optional(),
  createdAt: z.date(),
  revokedAt: z.date().optional(),
});
export type ApiKey = z.infer<typeof apiKeySchema>;

/** The prefix every API key starts with, so leaked keys are easy to scan for. */
export const API_KEY_PREFIX = 'smk_';

/**
 * Splits a presented key `smk_<id>_<secret>` into its id and secret, or returns undefined
 * when it does not have that shape. It says nothing about whether the key is valid.
 */
export function parseApiKey(raw: string): { id: ApiKeyId; secret: string } | undefined {
  const match = /^smk_(key_[a-z2-7]{12})_([A-Za-z0-9_-]{43})$/.exec(raw);
  if (match === null) return undefined;
  const [, id, secret] = match;
  if (id === undefined || secret === undefined) return undefined;
  return { id, secret };
}
