import type { AccessStatus } from '../access/access-status.js';
import type { Doi } from '../article/doi.js';

/** Who is asking, as far as the server knows. Never contains query text. */
export interface Caller {
  readonly apiKeyId: string;
  readonly institutionId?: string;
}

/** An access decision plus where a reader can log in or buy when they lack access. */
export interface AccessDecision {
  readonly status: AccessStatus;
  readonly loginUrl?: string;
  readonly purchaseUrl?: string;
}

/** Decides what a caller may read. The demo uses a mock; Thieme would plug in its own. */
export interface Entitlements {
  check(
    request: { readonly doi: Doi; readonly isOpenAccess: boolean; readonly caller: Caller },
    signal: AbortSignal,
  ): Promise<AccessDecision>;
}
