import {
  LANDING_SESSION_TTL_MS,
  landingSessionSchema,
  type LandingSession,
} from '@scholarly-mcp/core';

/** A fluent, immutable builder for valid landing sessions. */
export interface LandingSessionBuilder {
  withToken(token: string): LandingSessionBuilder;
  withResults(...dois: string[]): LandingSessionBuilder;
  /** Sets the creation time; expiry follows 24 h later. */
  createdAt(date: Date): LandingSessionBuilder;
  withVisits(visitCount: number): LandingSessionBuilder;
  build(): LandingSession;
}

interface Draft {
  token: string;
  dois: string[];
  createdAt: Date;
  visitCount: number;
}

const DEFAULTS: Draft = {
  token: 'AAAAAAAAAAAAAAAAAAAAAA',
  dois: ['10.1055/a-0000-0001'],
  createdAt: new Date('2026-11-02T10:00:00Z'),
  visitCount: 0,
};

/** Starts a builder for a fresh one-result session. */
export function aLandingSession(draft: Draft = DEFAULTS): LandingSessionBuilder {
  const next = (changes: Partial<Draft>) => aLandingSession({ ...draft, ...changes });
  return {
    withToken: (token) => next({ token }),
    withResults: (...dois) => next({ dois }),
    createdAt: (createdAt) => next({ createdAt }),
    withVisits: (visitCount) => next({ visitCount }),
    build: () =>
      landingSessionSchema.parse({
        token: draft.token,
        results: draft.dois.map((doi) => ({ doi, matchedChunkId: `${doi}#0` })),
        language: 'any',
        apiKeyId: 'key_test',
        createdAt: draft.createdAt,
        expiresAt: new Date(draft.createdAt.getTime() + LANDING_SESSION_TTL_MS),
        visitCount: draft.visitCount,
      }),
  };
}
