import type { RandomToken, Token } from '@scholarly-mcp/core';

/** Returns predictable, valid tokens: `0000…0001`, `0000…0002`, and so on. */
export function createSequentialTokens(): RandomToken {
  let counter = 0;
  return {
    next: () => {
      counter += 1;
      return String(counter).padStart(22, '0') as Token;
    },
  };
}
