import { appError, normalizeText } from '@scholarly-mcp/core';

/** The longest query searched; longer input is cut (PLAN.md "Query pipeline"). */
export const QUERY_MAX_LENGTH = 500;

const WHITESPACE = /\s+/g;
const WORD = /[\p{L}\p{N}]/u;

/**
 * Cleans a raw query: Unicode NFC, soft hyphens, zero-width and control characters removed,
 * whitespace collapsed, then cut to 500 characters without splitting a code point. Throws
 * `INVALID_INPUT` when no letter or digit is left, since there is nothing to search for.
 */
export function normalizeQuery(raw: string): string {
  const cleaned = normalizeText(raw).replace(WHITESPACE, ' ').trim();
  const capped = Array.from(cleaned).slice(0, QUERY_MAX_LENGTH).join('').trimEnd();
  if (!WORD.test(capped)) {
    throw appError('INVALID_INPUT', 'query must contain at least one letter or digit', {
      field: 'query',
    });
  }
  return capped;
}
