import { describe, expect, it } from 'vitest';
import { landingPageSchema } from './landing-page.js';

const summary = {
  doi: '10.1055/a-1001',
  title: 'Rivaroxaban dosing',
  journal: 'Thrombosis and Haemostasis',
  year: 2025,
  teaser: 'Lower doses were safe.',
  access: 'open',
  retracted: false,
};

const page = {
  session: 'active',
  language: 'en',
  topics: ['Atrial Fibrillation'],
  chosen: {
    ...summary,
    authors: ['Ada Lovelace'],
    authorCount: 1,
    published: { year: 2025, month: 3 },
    subjects: ['Atrial Fibrillation'],
    license: 'https://creativecommons.org/licenses/by/4.0/',
    articleUrl: 'https://www.thieme-connect.de/products/ejournals/abstract/10.1055/a-1001',
    doiUrl: 'https://doi.org/10.1055/a-1001',
  },
  access: { status: 'open' },
  matchedPassage: { in: 'abstract', text: 'Lower doses were safe.' },
  matches: [],
  related: [],
};

describe('landingPageSchema', () => {
  it('accepts a page', () => {
    expect(landingPageSchema.safeParse(page).success).toBe(true);
  });

  it('drops passage text from a full-text match, so it can never be shown', () => {
    const parsed = landingPageSchema.parse({
      ...page,
      matchedPassage: { in: 'fullText', section: 'Methods', text: 'secret full text' },
    });
    expect(parsed.matchedPassage).toEqual({ in: 'fullText', section: 'Methods' });
  });

  it('drops query text instead of passing it on', () => {
    expect(landingPageSchema.parse({ ...page, query: 'Vorhofflimmern' })).not.toHaveProperty(
      'query',
    );
  });

  it.each([
    ['a teaser over 280 characters', { matches: [{ ...summary, teaser: 'x'.repeat(281) }] }],
    ['a DOI that is not canonical', { matches: [{ ...summary, doi: '10.1055/A-1001' }] }],
    ['more than three topics', { topics: ['a', 'b', 'c', 'd'] }],
  ])('rejects %s', (_case, override) => {
    expect(landingPageSchema.safeParse({ ...page, ...override }).success).toBe(false);
  });
});
