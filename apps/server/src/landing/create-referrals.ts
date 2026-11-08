import { createHash } from 'node:crypto';
import type {
  ArticleReader,
  Clock,
  Doi,
  LandingAction,
  LandingActionEvent,
  LandingVisitEvent,
  Logger,
  Meter,
  SessionStore,
  Token,
} from '@scholarly-mcp/core';

/** What the reader's browser confirmed: it opened a result, or clicked an access button. */
export type Referral =
  | { readonly kind: 'landing_visit'; readonly token: Token; readonly doi: Doi }
  | {
      readonly kind: 'landing_action';
      readonly token: Token;
      readonly doi: Doi;
      readonly action: LandingAction;
    };

/** Turns confirmed landing visits and actions into metering events (ADR 0033). */
export interface Referrals {
  /**
   * Records the referral when its token is live and its DOI is one of the session's
   * results, and returns the event; otherwise returns undefined. Side stores that fail are
   * logged, never thrown, as a referral is a side record.
   */
  record(
    referral: Referral,
    signal: AbortSignal,
  ): Promise<LandingVisitEvent | LandingActionEvent | undefined>;
}

export interface ReferralsDeps {
  readonly reader: Pick<ArticleReader, 'findManyByDoi'>;
  readonly sessions: SessionStore;
  readonly meter: Meter;
  readonly clock: Clock;
  readonly logger: Logger;
}

/**
 * Checks each referral against its session, so a forged or replayed beacon cannot inflate a
 * journal's numbers, and takes the journal from the index. The event id is a hash of kind,
 * token, DOI and action: a second tab or a retried beacon makes the same id, which the
 * outbox and the funnel drop, and the token itself never leaves the session store.
 */
export function createReferrals(deps: ReferralsDeps): Referrals {
  const { reader, sessions, meter, clock, logger } = deps;

  async function sideRead<T>(signal: AbortSignal, what: string, read: () => Promise<T>) {
    try {
      return await read();
    } catch (error) {
      if (signal.aborted) throw error;
      logger.warn({ err: error }, `Landing referral not recorded: ${what} failed`);
      return undefined;
    }
  }

  return {
    async record(referral, signal) {
      const { token, doi } = referral;
      const session = await sideRead(signal, 'session lookup', () => sessions.find(token, signal));
      if (session === undefined || session.expiresAt <= clock.now()) return undefined;
      if (!session.results.some((result) => result.doi === doi)) return undefined;
      const [article] =
        (await sideRead(signal, 'article lookup', () => reader.findManyByDoi([doi], signal))) ?? [];
      if (article === undefined) return undefined;

      if (referral.kind === 'landing_visit') {
        await sideRead(signal, 'visit count', () => sessions.recordVisit(token, signal));
      }
      const common = {
        ...(session.tool !== undefined && { tool: session.tool }),
        doi,
        journal: article.journal.name,
        billable: false as const,
        occurredAt: clock.now(),
      };
      const event: LandingVisitEvent | LandingActionEvent =
        referral.kind === 'landing_visit'
          ? { ...common, kind: 'landing_visit', id: referralId(['landing_visit', token, doi]) }
          : {
              ...common,
              kind: 'landing_action',
              action: referral.action,
              id: referralId(['landing_action', token, doi, referral.action]),
            };
      meter.record(event);
      return event;
    },
  };
}

/** A deterministic, token-free event id: SHA-256 of the parts, base64url. */
function referralId(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\n')).digest('base64url');
}
