import type { LandingSession } from '../landing/landing-session.js';
import type { Token } from '../landing/token.js';

/** Holds landing sessions for their 24 h lifetime. */
export interface SessionStore {
  save(session: LandingSession, signal: AbortSignal): Promise<void>;
  /** Returns the session, or undefined when unknown. Callers check `expiresAt` themselves. */
  find(token: Token, signal: AbortSignal): Promise<LandingSession | undefined>;
  /** Counts a confirmed landing visit; does nothing for an unknown token. */
  recordVisit(token: Token, signal: AbortSignal): Promise<void>;
  /** Deletes sessions that expired before `now` and returns how many were removed. */
  deleteExpired(now: Date, signal: AbortSignal): Promise<number>;
}
