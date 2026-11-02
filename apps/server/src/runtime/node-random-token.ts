import { randomBytes } from 'node:crypto';
import { tokenSchema, type RandomToken } from '@scholarly-mcp/core';

/** Landing tokens from the OS's CSPRNG: 128 random bits, base64url (key design decision 12). */
export function createNodeRandomToken(): RandomToken {
  return { next: () => tokenSchema.parse(randomBytes(16).toString('base64url')) };
}
