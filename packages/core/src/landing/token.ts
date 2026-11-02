import { z } from 'zod';

/** A random 128-bit landing token, base64url-encoded without padding (22 characters). */
export type Token = string & { readonly __brand: 'Token' };

/** Validates a landing token's shape. It says nothing about whether the token exists. */
export const tokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{22}$/, 'Expected a 22-character landing token')
  .transform((value) => value as Token);
