import { anArticle } from '@scholarly-mcp/testkit';
import { describe, expect, it } from 'vitest';
import { cardAccess, cardLicense } from './card-access.js';
import { createMockEntitlements } from './create-mock-entitlements.js';

const now = new Date('2026-11-02T10:00:00Z');
const signal = new AbortController().signal;
const tdm = {
  url: 'https://www.thieme.de/de/autorenzentrum/licensing-4583.htm',
  contentVersion: 'vor' as const,
  start: new Date('2024-01-01T00:00:00Z'),
};

describe('cardAccess', () => {
  it('is open for open access and subscription otherwise, with or without a licence', () => {
    expect(cardAccess(anArticle().openAccess().build())).toBe('open');
    expect(cardAccess({ ...anArticle().build(), licenses: [tdm] })).toBe('subscription');
    expect(cardAccess(anArticle().build())).toBe('subscription');
  });

  it('treats a licence that starts in the future as not yet in force', () => {
    const embargoed = { ...tdm, start: new Date('2027-01-01T00:00:00Z') };
    expect(cardLicense({ ...anArticle().build(), licenses: [embargoed] }, now)).toBe('unknown');
  });
});

describe('createMockEntitlements', () => {
  const entitlements = createMockEntitlements();
  const doi = anArticle().build().doi;

  it('answers from the article alone: open access is open, the rest needs a subscription', async () => {
    expect(await entitlements.check({ doi, isOpenAccess: true }, signal)).toEqual({
      status: 'open',
    });
    expect(await entitlements.check({ doi, isOpenAccess: false }, signal)).toEqual({
      status: 'subscription',
      loginUrl: `https://doi.org/${doi}`,
      purchaseUrl: `https://doi.org/${doi}`,
    });
  });

  it('rejects when the caller has already aborted', async () => {
    const aborted = AbortSignal.abort(new Error('gone'));
    await expect(entitlements.check({ doi, isOpenAccess: true }, aborted)).rejects.toThrow('gone');
  });
});
