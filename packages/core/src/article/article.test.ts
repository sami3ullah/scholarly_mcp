import { describe, expect, it } from 'vitest';
import { articleSchema } from './article.js';

const valid = {
  doi: 'https://doi.org/10.1055/A-2236-7557',
  title: 'Per-oral cholangioscopy in primary sclerosing cholangitis',
  journal: { name: 'Endoscopy International Open', issnElectronic: '2196-9736' },
  authors: [
    { given: 'Ada', family: 'Lovelace', orcid: '0000-0002-1825-0097' },
    { family: 'Group' },
  ],
  published: { year: 2024, month: 1 },
  language: 'en',
  subjects: [{ label: 'Cholangitis, Sclerosing', origin: 'mesh' }],
  licenses: [
    {
      url: 'https://creativecommons.org/licenses/by/4.0/',
      contentVersion: 'vor',
      start: new Date('2024-01-01'),
    },
  ],
  isOpenAccess: true,
  isRetracted: false,
  landingUrl: 'https://www.thieme-connect.de/products/ejournals/abstract/10.1055/a-2236-7557',
  contentHash: 'a'.repeat(64),
  sourceUpdatedAt: new Date('2024-02-01'),
  ingestedAt: new Date('2024-03-01'),
};

describe('articleSchema', () => {
  it('accepts a record without an abstract and normalises its DOI', () => {
    const article = articleSchema.parse(valid);
    expect(article.doi).toBe('10.1055/a-2236-7557');
    expect(article.abstract).toBeUndefined();
  });

  it('rejects a journal with no ISSN', () => {
    const result = articleSchema.safeParse({ ...valid, journal: { name: 'Endoscopy' } });
    expect(result.error?.issues[0]?.message).toBe('A journal needs a print or electronic ISSN');
  });

  it('rejects an empty abstract instead of storing invented text', () => {
    expect(articleSchema.safeParse({ ...valid, abstract: '' }).success).toBe(false);
  });

  it.each([
    ['issn', { journal: { name: 'X', issnPrint: '12345678' } }],
    ['orcid', { authors: [{ family: 'X', orcid: 'https://orcid.org/0000-0002-1825-0097' }] }],
    ['subject origin', { subjects: [{ label: 'X', origin: 'crossref' }] }],
    ['content hash', { contentHash: 'abc' }],
    ['language', { language: 'deu' }],
  ])('rejects a malformed %s', (_field, override) => {
    expect(articleSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });
});
