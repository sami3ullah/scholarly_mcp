import type { LandingSession, SessionStore, Token } from '@scholarly-mcp/core';
import { settle } from './settle.js';

/** Creates an empty in-memory landing session store. */
export function createInMemorySessionStore(): SessionStore {
  const sessions = new Map<Token, LandingSession>();
  return {
    save: (session, signal) =>
      settle(signal, () => {
        sessions.set(session.token, session);
      }),
    find: (token, signal) => settle(signal, () => sessions.get(token)),
    recordVisit: (token, signal) =>
      settle(signal, () => {
        const session = sessions.get(token);
        if (session) sessions.set(token, { ...session, visitCount: session.visitCount + 1 });
      }),
    deleteExpired: (now, signal) =>
      settle(signal, () => {
        const expired = [...sessions.values()].filter((session) => session.expiresAt < now);
        for (const session of expired) sessions.delete(session.token);
        return expired.length;
      }),
  };
}
