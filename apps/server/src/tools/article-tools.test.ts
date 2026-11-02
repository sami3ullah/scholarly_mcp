import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startHarness, structured, textOf, type Harness } from '../testing/server-harness.js';

const errorOf = (result: Awaited<ReturnType<Harness['call']>>) => ({
  isError: result.isError,
  code: structured(result)['code'],
  field: structured(result)['field'],
});

describe('the article tools', () => {
  let harness: Harness;
  beforeEach(async () => {
    harness = await startHarness();
  });
  afterEach(async () => {
    await harness.close();
  });

  describe('get_article', () => {
    it('returns the card with subjects and the journal page, for any DOI spelling', async () => {
      const result = await harness.call('get_article', { doi: 'doi:10.1055/A-1001' });
      expect(structured(result)).toMatchObject({
        card: {
          doi: '10.1055/a-1001',
          whyMatched: 'Looked up by DOI',
          teaser: 'Rivaroxaban can be reduced in elderly patients.',
        },
        subjects: ['Atrial Fibrillation', 'anticoagulation'],
        journal: {
          name: 'Thrombosis and Haemostasis',
          issnPrint: '0340-6245',
          url: 'https://journals.example.org/issn/0340-6245',
        },
        retracted: false,
        fullTextIndexed: true,
      });
      expect(structured(result)).not.toHaveProperty('warning');
      expect(
        new URL((structured(result)['card'] as { url: string }).url).searchParams.get(
          'utm_campaign',
        ),
      ).toBe('get_article');
    });

    it('flags a retracted article instead of hiding it', async () => {
      const result = await harness.call('get_article', { doi: '10.1055/a-1003' });
      expect(structured(result)).toMatchObject({
        retracted: true,
        warning: expect.stringContaining('retracted') as string,
      });
      expect(textOf(result)).toMatch(/^WARNING: This article has been retracted/);
    });

    it('gives an empty teaser for an article without an abstract, never invented text', async () => {
      const result = await harness.call('get_article', { doi: '10.1055/a-1004' });
      expect(structured(result)).toMatchObject({ card: { teaser: '' }, fullTextIndexed: false });
    });

    it('is NOT_FOUND on doi for an unknown DOI, pointing to search_articles', async () => {
      const result = await harness.call('get_article', { doi: '10.1055/unknown' });
      expect(errorOf(result)).toEqual({ isError: true, code: 'NOT_FOUND', field: 'doi' });
      expect(textOf(result)).toContain('search_articles');
    });

    it('is INVALID_INPUT on doi for text that is not a DOI', async () => {
      expect(errorOf(await harness.call('get_article', { doi: 'rivaroxaban' }))).toEqual({
        isError: true,
        code: 'INVALID_INPUT',
        field: 'doi',
      });
    });
  });

  describe('find_related', () => {
    it('returns cards of other articles close in meaning, never the article itself', async () => {
      // Starting from the retracted study is allowed; its neighbours are what is returned.
      const result = await harness.call('find_related', { doi: '10.1055/a-1003', limit: 10 });
      const dois = (structured(result)['cards'] as { doi: string }[]).map(({ doi }) => doi);
      expect(structured(result)['article']).toEqual({
        doi: '10.1055/a-1003',
        title: 'Rivaroxaban dosing, a retracted study',
      });
      expect(dois).toEqual(['10.1055/a-1001']);
      expect(structured(result)['collectionUrl']).toContain('utm_campaign=find_related');
    });

    it('leaves retracted articles out of the neighbours', async () => {
      const result = await harness.call('find_related', { doi: '10.1055/a-1001' });
      const dois = (structured(result)['cards'] as { doi: string }[]).map(({ doi }) => doi);
      expect(dois).not.toContain('10.1055/a-1003');
    });

    it('answers an article without neighbours with a hint, not an error', async () => {
      const result = await harness.call('find_related', { doi: '10.1055/a-1004' });
      expect(structured(result)).toMatchObject({
        cards: [],
        hint: expect.stringContaining('search_articles') as string,
      });
    });

    it('is NOT_FOUND for an unknown DOI', async () => {
      expect(errorOf(await harness.call('find_related', { doi: '10.1055/unknown' }))).toMatchObject(
        {
          code: 'NOT_FOUND',
        },
      );
    });
  });

  describe('cite', () => {
    it('formats Vancouver by default, with the publisher link', async () => {
      const result = await harness.call('cite', { doi: '10.1055/a-1001' });
      expect(structured(result)).toMatchObject({
        style: 'vancouver',
        citation: expect.stringContaining('doi:10.1055/a-1001') as string,
        url: 'https://www.thieme-connect.de/products/ejournals/abstract/10.1055/a-1001',
        retracted: false,
      });
    });

    it.each(['vancouver', 'apa', 'ama', 'bibtex', 'ris'])('formats %s', async (style) => {
      const result = await harness.call('cite', { doi: '10.1055/a-1002', style });
      expect(structured(result)['citation']).toContain('10.1055/a-1002');
    });

    it('is INVALID_INPUT on style for an unknown style', async () => {
      expect(errorOf(await harness.call('cite', { doi: '10.1055/a-1001', style: 'mla' }))).toEqual({
        isError: true,
        code: 'INVALID_INPUT',
        field: 'style',
      });
    });

    it('warns when citing a retracted article', async () => {
      expect(textOf(await harness.call('cite', { doi: '10.1055/a-1003' }))).toMatch(/^WARNING/);
    });
  });

  describe('check_access', () => {
    it('reports open access articles as open', async () => {
      expect(
        structured(await harness.call('check_access', { doi: '10.1055/a-1001' })),
      ).toMatchObject({
        status: 'open',
      });
    });

    it('offers login and purchase links for subscription articles', async () => {
      expect(
        structured(await harness.call('check_access', { doi: '10.1055/a-1002' })),
      ).toMatchObject({
        status: 'subscription',
        loginUrl: 'https://doi.org/10.1055/a-1002',
        purchaseUrl: 'https://doi.org/10.1055/a-1002',
      });
    });
  });

  describe('get_journal', () => {
    it('describes a journal found by ISSN from its indexed articles', async () => {
      const result = await harness.call('get_journal', { issn: '0340-6245' });
      expect(structured(result)['journals']).toEqual([
        {
          name: 'Thrombosis and Haemostasis',
          issnPrint: '0340-6245',
          articleCount: 2,
          openAccess: { policy: 'hybrid', openArticles: 1 },
          years: { first: 2025, last: 2025 },
          subjects: ['anticoagulation', 'Atrial Fibrillation'],
          url: 'https://journals.example.org/issn/0340-6245',
        },
      ]);
    });

    it('finds journals by part of their name', async () => {
      const result = await harness.call('get_journal', { query: 'medizinische' });
      expect(structured(result)['journals']).toEqual([
        expect.objectContaining({
          name: 'DMW - Deutsche Medizinische Wochenschrift',
          openAccess: { policy: 'subscription', openArticles: 0 },
        }),
      ]);
    });

    it.each([
      ['neither issn nor query', {}],
      ['both issn and query', { issn: '0340-6245', query: 'Thrombosis' }],
    ])('is INVALID_INPUT for %s', async (_case, args) => {
      expect(errorOf(await harness.call('get_journal', args))).toMatchObject({
        code: 'INVALID_INPUT',
      });
    });

    it('is INVALID_INPUT on issn for text that is not an ISSN', async () => {
      expect(errorOf(await harness.call('get_journal', { issn: 'abcd' }))).toEqual({
        isError: true,
        code: 'INVALID_INPUT',
        field: 'issn',
      });
    });

    it('is NOT_FOUND for an unknown journal', async () => {
      expect(errorOf(await harness.call('get_journal', { query: 'Lancet' }))).toMatchObject({
        code: 'NOT_FOUND',
        field: 'query',
      });
      expect(errorOf(await harness.call('get_journal', { issn: '1234-5678' }))).toMatchObject({
        code: 'NOT_FOUND',
        field: 'issn',
      });
    });
  });
});
