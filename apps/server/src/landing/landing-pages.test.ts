import {
  LANDING_SESSION_TTL_MS,
  landingPageSchema,
  tokenSchema,
  type LandingSession,
  type SessionStore,
} from '@scholarly-mcp/core';
import {
  aChunk,
  createFakeClock,
  createInMemorySessionStore,
  createTestLogger,
  type CapturedLine,
} from '@scholarly-mcp/testkit';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FULL_TEXT_MARKER,
  doi,
  startHarness,
  structured,
  type Harness,
} from '../testing/server-harness.js';
import { createLandingPages } from './create-landing-pages.js';
import { matchedPassage } from './matched-passage.js';

const signal = new AbortController().signal;
const token = tokenSchema.parse('TTTTTTTTTTTTTTTTTTTTTT');
const created = new Date('2026-11-02T10:00:00Z');

function session(
  results: LandingSession['results'],
  overrides: Partial<LandingSession> = {},
): LandingSession {
  return {
    token,
    results,
    language: 'any',
    apiKeyId: 'key_test',
    createdAt: created,
    expiresAt: new Date(created.getTime() + LANDING_SESSION_TTL_MS),
    visitCount: 0,
    ...overrides,
  };
}

const result = (value: string, chunk?: number) => ({
  doi: doi(value),
  ...(chunk !== undefined && { matchedChunkId: `${value}#${String(chunk)}` }),
});

let harness: Harness | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

async function withSession(saved: LandingSession, overrides = {}) {
  harness = await startHarness({ overrides });
  await harness.sessions.save(saved, signal);
  return harness;
}

describe('landing pages from a search', () => {
  it('opens the clicked result of a real search with the other results below it', async () => {
    harness = await startHarness();
    const response = structured(
      await harness.call('search_articles', { query: 'outcomes dosing' }),
    );
    const cards = response['cards'] as { doi: string; url: string }[];
    expect(cards.length).toBeGreaterThan(1);
    const clicked = new URL(cards[1]?.url ?? '');

    const page = await harness.landingPages.resolve(
      {
        token: tokenSchema.parse(clicked.searchParams.get('t')),
        doi: doi(clicked.searchParams.get('doi') ?? ''),
      },
      signal,
    );

    expect(page?.session).toBe('active');
    expect(page?.chosen.doi).toBe(cards[1]?.doi);
    expect(page?.matches.map((match) => match.doi)).toEqual(
      cards.filter((_, index) => index !== 1).map((card) => card.doi),
    );
    expect(landingPageSchema.safeParse(page).success).toBe(true);
  });

  it('opens the first result from the collection link, which has no DOI', async () => {
    const live = await withSession(session([result('10.1055/a-1002'), result('10.1055/a-1001')]));
    const page = await live.landingPages.resolve({ token }, signal);
    expect(page?.chosen.doi).toBe('10.1055/a-1002');
    expect(page?.matches.map((match) => match.doi)).toEqual(['10.1055/a-1001']);
  });

  it('skips results that left the index and opens the next one', async () => {
    const live = await withSession(session([result('10.1055/a-9999'), result('10.1055/a-1001')]));
    const page = await live.landingPages.resolve({ token }, signal);
    expect(page?.chosen.doi).toBe('10.1055/a-1001');
    expect(page?.matches).toEqual([]);
  });

  it('opens a DOI outside the results with all results as matches', async () => {
    const live = await withSession(session([result('10.1055/a-1002')]));
    const page = await live.landingPages.resolve({ token, doi: doi('10.1055/a-1001') }, signal);
    expect(page?.chosen.doi).toBe('10.1055/a-1001');
    expect(page?.matches.map((match) => match.doi)).toEqual(['10.1055/a-1002']);
    expect(page?.matchedPassage).toBeUndefined();
  });

  it("names the topic from the results' subjects, never from a query", async () => {
    const live = await withSession(session([result('10.1055/a-1001'), result('10.1055/a-1002')]));
    const page = await live.landingPages.resolve({ token }, signal);
    expect(page?.topics).toEqual(['Atrial Fibrillation', 'anticoagulation']);
  });

  it('decides access through the entitlement adapter', async () => {
    const live = await withSession(session([result('10.1055/a-1002')]));
    const page = await live.landingPages.resolve({ token }, signal);
    expect(page?.access).toEqual({
      status: 'subscription',
      loginUrl: 'https://doi.org/10.1055/a-1002',
      purchaseUrl: 'https://doi.org/10.1055/a-1002',
    });
  });

  it('uses the search language, else the chosen article language', async () => {
    const german = await withSession(session([result('10.1055/a-1001')], { language: 'de' }));
    expect((await german.landingPages.resolve({ token }, signal))?.language).toBe('de');
    await german.close();
    harness = undefined;
    const any = await withSession(session([result('10.1055/a-1002')]));
    expect((await any.landingPages.resolve({ token }, signal))?.language).toBe('de');
  });
});

describe('the matched passage', () => {
  it('quotes the abstract chunk that matched', async () => {
    const live = await withSession(session([result('10.1055/a-1001', 0)]));
    const page = await live.landingPages.resolve({ token }, signal);
    expect(page?.matchedPassage).toEqual({
      in: 'abstract',
      text: 'Lower rivaroxaban doses were safe in elderly patients',
      section: 'Results',
    });
  });

  it('names only the section of a full-text match and never shows its text', async () => {
    const live = await withSession(session([result('10.1055/a-1001', 1)]));
    const page = await live.landingPages.resolve({ token }, signal);
    expect(page?.matchedPassage).toEqual({ in: 'fullText', section: 'Methods' });
    expect(JSON.stringify(page)).not.toContain(FULL_TEXT_MARKER);
  });

  it('says a metadata chunk matched on the title', () => {
    const chunk = { ...aChunk().build(), origin: 'metadata' as const };
    expect(matchedPassage(chunk)).toEqual({ in: 'title' });
  });
});

describe('falling back to the DOI', () => {
  it('shows the article alone once the token has expired', async () => {
    const live = await withSession(
      session([result('10.1055/a-1001'), result('10.1055/a-1002')], {
        createdAt: new Date(created.getTime() - LANDING_SESSION_TTL_MS),
        expiresAt: created,
      }),
    );
    const page = await live.landingPages.resolve({ token, doi: doi('10.1055/a-1002') }, signal);
    expect(page?.session).toBe('unavailable');
    expect(page?.chosen.doi).toBe('10.1055/a-1002');
    expect(page?.matches).toEqual([]);
    expect(page?.topics).toEqual([]);
  });

  it('shows the article for a link without a token', async () => {
    harness = await startHarness();
    const page = await harness.landingPages.resolve({ doi: doi('10.1055/a-1001') }, signal);
    expect(page?.session).toBe('none');
    expect(page?.chosen.abstract).toContain('Rivaroxaban can be reduced');
  });

  it.each([
    ['an unknown token without a DOI', { token }],
    ['a DOI that is not indexed', { doi: doi('10.1055/a-9999') }],
    ['nothing at all', {}],
  ])('has no page for %s', async (_case, request) => {
    harness = await startHarness();
    expect(await harness.landingPages.resolve(request, signal)).toBeUndefined();
  });
});

describe('side systems', () => {
  async function pagesWith(overrides: {
    sessions?: SessionStore;
    failEntitlements?: boolean;
    failRelated?: boolean;
    relatedDois?: string[];
  }) {
    const started = await startHarness();
    harness = started;
    const logs: CapturedLine[] = [];
    const sessions = overrides.sessions ?? started.sessions;
    await sessions.save(session([result('10.1055/a-1001')]), signal).catch(() => undefined);
    const pages = createLandingPages({
      reader: started.store,
      search: {
        related: () =>
          overrides.failRelated === true
            ? Promise.reject(new Error('index busy'))
            : started.store
                .findManyByDoi((overrides.relatedDois ?? []).map(doi), signal)
                .then((articles) => ({
                  article: undefined as never,
                  hits: articles.map((article) => ({ article, teaser: '', whyMatched: '' })),
                  indexVersion: 'v1',
                })),
      },
      sessions,
      entitlements: {
        check: () =>
          overrides.failEntitlements === true
            ? Promise.reject(new Error('entitlements down'))
            : Promise.resolve({ status: 'open' }),
      },
      clock: createFakeClock(created),
      logger: createTestLogger(logs),
    });
    return { pages, logs };
  }

  it('falls back to the DOI when the session store fails', async () => {
    const failing: SessionStore = {
      ...createInMemorySessionStore(),
      find: () => Promise.reject(new Error('disk gone')),
    };
    const { pages, logs } = await pagesWith({ sessions: failing });
    const page = await pages.resolve({ token, doi: doi('10.1055/a-1001') }, signal);
    expect(page?.session).toBe('unavailable');
    expect(logs.some((line) => line.message.includes('session lookup failed'))).toBe(true);
  });

  it('shows access from the record when entitlements fail', async () => {
    const { pages } = await pagesWith({ failEntitlements: true });
    expect((await pages.resolve({ token }, signal))?.access).toEqual({ status: 'open' });
  });

  it('leaves the search results out of related reading', async () => {
    const { pages } = await pagesWith({
      relatedDois: ['10.1055/a-1001', '10.1055/a-1004', '10.1055/a-1002'],
    });
    const page = await pages.resolve({ token }, signal);
    expect(page?.related.map((article) => article.doi)).toEqual([
      '10.1055/a-1004',
      '10.1055/a-1002',
    ]);
  });

  it('goes without related reading when it fails', async () => {
    const { pages, logs } = await pagesWith({ failRelated: true });
    expect((await pages.resolve({ token }, signal))?.related).toEqual([]);
    expect(logs.some((line) => line.message.includes('Related reading failed'))).toBe(true);
  });
});
