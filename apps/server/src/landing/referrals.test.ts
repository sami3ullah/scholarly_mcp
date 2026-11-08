import {
  LANDING_SESSION_TTL_MS,
  tokenSchema,
  type ArticleReader,
  type LandingSession,
  type SessionStore,
} from '@scholarly-mcp/core';
import { createInMemorySessionStore, createTestLogger } from '@scholarly-mcp/testkit';
import { afterEach, describe, expect, it } from 'vitest';
import { doi, startHarness, structured, type Harness } from '../testing/server-harness.js';
import { createReferrals } from './create-referrals.js';

const signal = new AbortController().signal;
const token = tokenSchema.parse('TTTTTTTTTTTTTTTTTTTTTT');
const created = new Date('2026-11-02T10:00:00Z');
const a1001 = doi('10.1055/a-1001');
const a1002 = doi('10.1055/a-1002');

function session(overrides: Partial<LandingSession> = {}): LandingSession {
  return {
    token,
    results: [{ doi: a1001 }, { doi: a1002 }],
    language: 'any',
    tool: 'search_articles',
    createdAt: created,
    expiresAt: new Date(created.getTime() + LANDING_SESSION_TTL_MS),
    visitCount: 0,
    ...overrides,
  };
}

let harness: Harness | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

async function withSession(saved: LandingSession | undefined, overrides = {}) {
  harness = await startHarness({ overrides });
  if (saved !== undefined) await harness.sessions.save(saved, signal);
  return harness;
}

const visit = { kind: 'landing_visit', token, doi: a1001 } as const;

describe('recording landing referrals', () => {
  it('records a visit to a result as a token-free event with its journal', async () => {
    const live = await withSession(session());
    const event = await live.referrals.record(visit, signal);
    expect(event).toMatchObject({
      kind: 'landing_visit',
      tool: 'search_articles',
      doi: '10.1055/a-1001',
      journal: 'Thrombosis and Haemostasis',
      billable: false,
    });
    await live.flushMeter();
    expect(live.outbox.all()).toEqual([event]);
    expect(JSON.stringify(live.outbox.all())).not.toContain(token);
    expect((await live.sessions.find(token, signal))?.visitCount).toBe(1);
  });

  it('gives a repeated visit the same id, so it is stored once', async () => {
    const live = await withSession(session());
    const first = await live.referrals.record(visit, signal);
    const again = await live.referrals.record(visit, signal);
    expect(again?.id).toBe(first?.id);
    await live.flushMeter();
    expect(live.outbox.all()).toHaveLength(1);
  });

  it('counts each result and each action separately', async () => {
    const live = await withSession(session());
    const ids = new Set(
      await Promise.all(
        [
          visit,
          { ...visit, doi: a1002 },
          { kind: 'landing_action', token, doi: a1001, action: 'read' },
          { kind: 'landing_action', token, doi: a1001, action: 'buy' },
        ].map(async (referral) => (await live.referrals.record(referral as never, signal))?.id),
      ),
    );
    expect(ids.size).toBe(4);
    expect(ids.has(undefined)).toBe(false);
  });

  it('records an action without counting a visit', async () => {
    const live = await withSession(session());
    const event = await live.referrals.record(
      { kind: 'landing_action', token, doi: a1002, action: 'sign_in' },
      signal,
    );
    expect(event).toMatchObject({
      kind: 'landing_action',
      action: 'sign_in',
      journal: 'DMW - Deutsche Medizinische Wochenschrift',
    });
    expect((await live.sessions.find(token, signal))?.visitCount).toBe(0);
  });

  it.each([
    ['an unknown token', undefined, visit],
    [
      'an expired token',
      session({
        createdAt: new Date(created.getTime() - LANDING_SESSION_TTL_MS),
        expiresAt: created,
      }),
      visit,
    ],
    ['a DOI outside the results', session(), { ...visit, doi: doi('10.1055/a-1003') }],
    [
      'a result that left the index',
      session({ results: [{ doi: doi('10.1055/gone') }] }),
      {
        ...visit,
        doi: doi('10.1055/gone'),
      },
    ],
  ])('records nothing for %s', async (_case, saved, referral) => {
    const live = await withSession(saved);
    expect(await live.referrals.record(referral, signal)).toBeUndefined();
    await live.flushMeter();
    expect(live.outbox.all()).toEqual([]);
  });

  it('leaves the tool out for a session stored before sessions knew it', async () => {
    const old = session();
    delete old.tool;
    const live = await withSession(old);
    expect(await live.referrals.record(visit, signal)).not.toHaveProperty('tool');
  });

  it('still records the event when the visit count cannot be stored', async () => {
    const store = createInMemorySessionStore();
    const failing: SessionStore = {
      ...store,
      recordVisit: () => Promise.reject(new Error('disk full')),
    };
    const live = await withSession(undefined, { sessions: failing });
    await failing.save(session(), signal);
    expect(await live.referrals.record(visit, signal)).toBeDefined();
    expect(live.logs.some((line) => line.message.includes('visit count failed'))).toBe(true);
  });

  it('records nothing, and does not throw, when the session store fails', async () => {
    const failing: SessionStore = {
      ...createInMemorySessionStore(),
      find: () => Promise.reject(new Error('locked')),
    };
    const live = await withSession(undefined, { sessions: failing });
    expect(await live.referrals.record(visit, signal)).toBeUndefined();
  });

  it('records nothing when the article lookup fails', async () => {
    const reader: Pick<ArticleReader, 'findManyByDoi'> = {
      findManyByDoi: () => Promise.reject(new Error('index swapped')),
    };
    const sessions = createInMemorySessionStore();
    await sessions.save(session(), signal);
    const referrals = createReferrals({
      reader,
      sessions,
      meter: { record: () => undefined, flush: () => Promise.resolve() },
      clock: { now: () => created },
      logger: createTestLogger(),
    });
    expect(await referrals.record(visit, signal)).toBeUndefined();
  });

  it('attributes a visit from a real search link to the tool that made it', async () => {
    harness = await startHarness();
    const result = structured(await harness.call('search_articles', { query: 'rivaroxaban' }));
    const [card] = result['cards'] as { url: string; doi: string }[];
    const url = new URL(card?.url ?? '');
    const linkToken = tokenSchema.parse(url.searchParams.get('t'));
    const event = await harness.referrals.record(
      { kind: 'landing_visit', token: linkToken, doi: doi(card?.doi ?? '') },
      signal,
    );
    expect(event).toMatchObject({ tool: 'search_articles' });
  });
});
