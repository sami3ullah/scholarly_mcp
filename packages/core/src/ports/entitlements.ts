import type { AccessStatus } from '../access/access-status.js';
import type { Doi } from '../article/doi.js';

/** An access decision plus where a reader can log in or buy when they lack access. */
export interface AccessDecision {
  readonly status: AccessStatus;
  readonly loginUrl?: string;
  readonly purchaseUrl?: string;
}

/**
 * Decides whether an article can be read and where a reader signs in or buys. Callers are
 * anonymous (ADR 0048), so the answer depends on the article alone. The demo uses a mock;
 * Thieme would plug in its own.
 */
export interface Entitlements {
  check(
    request: { readonly doi: Doi; readonly isOpenAccess: boolean },
    signal: AbortSignal,
  ): Promise<AccessDecision>;
}
