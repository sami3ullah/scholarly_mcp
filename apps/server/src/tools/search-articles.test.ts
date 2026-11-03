import { tokenSchema } from '@scholarly-mcp/core';
import { anArticle } from '@scholarly-mcp/testkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LANDING,
  recordsOf,
  startHarness,
  structured,
  textOf,
  type Harness,
} from '../testing/server-harness.js';
import { TEXT_BUDGET_BYTES } from './render-cards.js';

interface Card {
  doi: string;
  url: string;
  access: string;
  license: string;
}

const cardsOf = (result: Awaited<ReturnType<Harness['call']>>) =>
  (structured(result)['cards'] ?? []) as Card[];
const errorOf = (result: Awaited<ReturnType<Harness['call']>>) => ({
  isError: result.isError,
  code: structured(result)['code'],
  field: structured(result)['field'],
});

describe('search_articles', () => {
  let harness: Harness;
  beforeEach(async () => {
    harness = await startHarness();
  });
  afterEach(async () => {
    await harness.close();
  });

  it('returns cards whose links carry the token, the DOI and UTM tags', async () => {
    const [card] = cardsOf(await harness.call('search_articles', { query: 'rivaroxaban dosing' }));
    const url = new URL(card?.url ?? '');
    expect(url.origin).toBe(LANDING);
    expect(url.pathname).toBe('/mcp/landing');
    expect(tokenSchema.safeParse(url.searchParams.get('t')).success).toBe(true);
    expect(url.searchParams.get('doi')).toBe(card?.doi);
    expect(url.searchParams.get('utm_campaign')).toBe('search_articles');
  });

  it('stores the results under the token, without any query text', async () => {
    const result = await harness.call('search_articles', {
      query: 'rivaroxaban dosing',
      language: 'en',
    });
    const token = tokenSchema.parse(
      new URL(String(structured(result)['collectionUrl'])).searchParams.get('t'),
    );
    const session = await harness.sessions.find(token, new AbortController().signal);
    expect(session).toMatchObject({
      results: [{ doi: '10.1055/a-1001', matchedChunkId: expect.any(String) as string }],
      language: 'en',
      apiKeyId: 'local',
    });
    expect(JSON.stringify(session)).not.toContain('rivaroxaban dosing');
    expect(new URL(String(structured(result)['collectionUrl'])).search).not.toContain(
      'rivaroxaban',
    );
  });

  it('gives open access cards their licence and badge', async () => {
    const [card] = cardsOf(await harness.call('search_articles', { query: 'rivaroxaban' }));
    expect(card).toMatchObject({
      access: 'open',
      license: 'https://creativecommons.org/licenses/by/4.0/',
    });
  });

  it('marks a closed card without licence information as subscription', async () => {
    const [card] = cardsOf(await harness.call('search_articles', { query: 'hip replacement' }));
    expect(card).toMatchObject({
      doi: '10.1055/a-1004',
      access: 'subscription',
      license: 'unknown',
    });
  });

  it('leaves retracted articles out', async () => {
    const dois = cardsOf(await harness.call('search_articles', { query: 'rivaroxaban doses' })).map(
      ({ doi }) => doi,
    );
    expect(dois).not.toContain('10.1055/a-1003');
  });

  it('looks a pasted DOI up directly', async () => {
    const result = await harness.call('search_articles', {
      query: 'https://doi.org/10.1055/A-1002',
    });
    expect(cardsOf(result).map(({ doi }) => doi)).toEqual(['10.1055/a-1002']);
  });

  it.each([
    ['a journal name', 'DMW'],
    ['a journal name with umlaut spelling', 'deutsche medizinische wochenschrift'],
    ['an ISSN', '0012-0472'],
  ])('filters by %s', async (_case, journal) => {
    const result = await harness.call('search_articles', { query: 'Antikoagulation', journal });
    expect(cardsOf(result).map(({ doi }) => doi)).toEqual(['10.1055/a-1002']);
  });

  it('is INVALID_INPUT on journal for an unknown journal', async () => {
    const result = await harness.call('search_articles', {
      query: 'rivaroxaban',
      journal: 'Lancet',
    });
    expect(errorOf(result)).toEqual({ isError: true, code: 'INVALID_INPUT', field: 'journal' });
    expect(textOf(result)).toContain('get_journal');
  });

  it('is INVALID_INPUT on yearFrom when it is after yearTo', async () => {
    const result = await harness.call('search_articles', {
      query: 'rivaroxaban',
      yearFrom: 2026,
      yearTo: 2024,
    });
    expect(errorOf(result)).toEqual({ isError: true, code: 'INVALID_INPUT', field: 'yearFrom' });
  });

  it.each([
    ['an empty query', { query: '' }, 'query'],
    ['a query over 500 characters', { query: 'a'.repeat(501) }, 'query'],
    ['a limit over 10', { query: 'x', limit: 11 }, 'limit'],
    ['a fractional limit', { query: 'x', limit: 2.5 }, 'limit'],
    ['an unknown language', { query: 'x', language: 'fr' }, 'language'],
    ['a missing query', {}, 'query'],
  ])('is INVALID_INPUT naming the field for %s', async (_case, args, field) => {
    const result = await harness.call('search_articles', args);
    expect(errorOf(result)).toEqual({ isError: true, code: 'INVALID_INPUT', field });
    expect(String(structured(result)['message'])).toContain(field);
  });

  it('rejects unknown arguments instead of ignoring them', async () => {
    const result = await harness.call('search_articles', { query: 'x', sort: 'date' });
    expect(errorOf(result)).toMatchObject({ code: 'INVALID_INPUT' });
    expect(String(structured(result)['message'])).toContain('sort');
  });

  it('answers no results with a hint to loosen the filters, not an error', async () => {
    const result = await harness.call('search_articles', {
      query: 'rivaroxaban',
      openAccessOnly: true,
      yearFrom: 2024,
      yearTo: 2024,
    });
    expect(result.isError).not.toBe(true);
    expect(structured(result)).toMatchObject({
      cards: [],
      hint: expect.stringContaining('Loosen your filters (years, open access)') as string,
    });
    expect(structured(result)).not.toHaveProperty('collectionUrl');
  });

  it('is CURSOR_STALE for a cursor of another index version', async () => {
    const stale = Buffer.from(JSON.stringify({ o: 5, v: 'v0' })).toString('base64url');
    const result = await harness.call('search_articles', { query: 'rivaroxaban', cursor: stale });
    expect(errorOf(result)).toMatchObject({ isError: true, code: 'CURSOR_STALE' });
    expect(textOf(result)).toContain('rerun the search');
  });

  it('never logs the query', async () => {
    await harness.call('search_articles', { query: 'Patientin 54 Jahre Vorhofflimmern' });
    expect(JSON.stringify(harness.logs)).not.toContain('Patientin');
  });
});

describe('search_articles paging and size', () => {
  const long = Array.from({ length: 12 }, (_, index) => ({
    article: anArticle()
      .withDoi(`10.1055/a-20${String(index).padStart(2, '0')}`)
      .withTitle(
        `Anticoagulation study ${String(index)} ${'with a deliberately long title '.repeat(5)}`,
      )
      .withAbstract(
        `Conclusion: ${'Anticoagulation was safe in this long conclusion sentence. '.repeat(8)}`,
      )
      .build(),
    chunks: [{ text: 'Anticoagulation outcomes', section: 'Results' }],
  }));

  it('pages with nextCursor until the results run out', async () => {
    const harness = await startHarness({ records: await recordsOf(long) });
    const first = await harness.call('search_articles', { query: 'anticoagulation', limit: 10 });
    const second = await harness.call('search_articles', {
      query: 'anticoagulation',
      limit: 10,
      cursor: structured(first)['nextCursor'],
    });
    await harness.close();
    expect(cardsOf(first)).toHaveLength(10);
    expect(cardsOf(second)).toHaveLength(2);
    expect(structured(second)).not.toHaveProperty('nextCursor');
  });

  it('keeps the default five long cards within the 5 KB text budget', async () => {
    const harness = await startHarness({ records: await recordsOf(long) });
    const result = await harness.call('search_articles', { query: 'anticoagulation' });
    await harness.close();
    expect(new TextEncoder().encode(textOf(result)).length).toBeLessThanOrEqual(TEXT_BUDGET_BYTES);
  });

  it('keeps every title and link of ten long cards, and the whole response under 20 KB', async () => {
    const harness = await startHarness({ records: await recordsOf(long) });
    const result = await harness.call('search_articles', { query: 'anticoagulation', limit: 10 });
    await harness.close();
    const text = textOf(result);
    expect(text.match(/\]\(https:/g)).toHaveLength(10);
    expect(text.match(/Teaser:/g)?.length ?? 0).toBeLessThan(10);
    expect(new TextEncoder().encode(JSON.stringify(result)).length).toBeLessThan(20 * 1024);
  });
});
