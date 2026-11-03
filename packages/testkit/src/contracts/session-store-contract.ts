import type { SessionStore, Token } from '@scholarly-mcp/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { aLandingSession } from '../builders/a-landing-session.js';

const signal = new AbortController().signal;
const HOUR = 60 * 60 * 1000;

/** The behaviour every landing session store must share. */
export function runSessionStoreContract(
  name: string,
  create: () => SessionStore | Promise<SessionStore>,
): void {
  describe(`${name} satisfies the session store contract`, () => {
    let store: SessionStore;
    beforeEach(async () => {
      store = await create();
    });

    it('returns undefined for an unknown token', async () => {
      expect(await store.find('0000000000000000000000' as Token, signal)).toBeUndefined();
    });

    it('returns a saved session unchanged, results in order', async () => {
      const session = aLandingSession().withResults('10.1055/a-2', '10.1055/a-1').build();
      await store.save(session, signal);
      expect(await store.find(session.token, signal)).toEqual(session);
    });

    it('keeps a session without a tool without one', async () => {
      const session = aLandingSession().withTool(undefined).build();
      await store.save(session, signal);
      expect(await store.find(session.token, signal)).toEqual(session);
    });

    it('counts visits, and ignores visits to unknown tokens', async () => {
      const session = aLandingSession().build();
      await store.save(session, signal);
      await store.recordVisit(session.token, signal);
      await store.recordVisit(session.token, signal);
      await store.recordVisit('1111111111111111111111' as Token, signal);
      expect((await store.find(session.token, signal))?.visitCount).toBe(2);
    });

    it('deletes only expired sessions and reports how many', async () => {
      const start = new Date('2026-11-01T00:00:00Z');
      const old = aLandingSession().withToken('oldoldoldoldoldoldold0').createdAt(start).build();
      const fresh = aLandingSession()
        .withToken('freshfreshfreshfresh00')
        .createdAt(new Date(start.getTime() + 12 * HOUR))
        .build();
      await store.save(old, signal);
      await store.save(fresh, signal);
      const removed = await store.deleteExpired(new Date(start.getTime() + 25 * HOUR), signal);
      expect(removed).toBe(1);
      expect(await store.find(old.token, signal)).toBeUndefined();
      expect(await store.find(fresh.token, signal)).toEqual(fresh);
    });

    it('rejects when the caller has already aborted', async () => {
      await expect(store.save(aLandingSession().build(), AbortSignal.abort())).rejects.toThrow();
    });
  });
}
