import type { Token } from '../landing/token.js';

/** A source of unguessable landing tokens, injected so tests are deterministic. */
export interface RandomToken {
  /** Returns a fresh random 128-bit token. */
  next(): Token;
}
