import { articleSchema } from '@scholarly-mcp/core';
import { describe, expect, it } from 'vitest';
import { aCrossrefWork } from '../testing/a-crossref-work.js';
import { mapWork, type MappedWork } from './map-work.js';

const now = new Date('2026-11-02T10:00:00Z');

function articleOf(mapped: MappedWork) {
  if (mapped.kind !== 'article') throw new Error(`Expected an article, got ${mapped.reason}`);
  return mapped.article;
}

describe('mapWork', () => {
  it('maps a Crossref work to a valid canonical article', async () => {
    const article = articleOf(await mapWork(aCrossrefWork(), { now }));
    expect(articleSchema.safeParse(article).success).toBe(true);
    expect(article).toMatchObject({
      doi: '10.1055/a-2236-8949',
      title: 'Design of Imidazo[1,2-a]pyridine-Based Donor–Acceptor Chromophores',
      journal: { name: 'Synlett', issnPrint: '0936-5214' },
      published: { year: 2024, month: 2, day: 1 },
      language: 'en',
      abstract: 'A series of chromophores.',
      subjects: [],
      isOpenAccess: true,
      isRetracted: false,
      landingUrl: 'http://www.thieme-connect.de/DOI/DOI?10.1055/a-2236-8949',
      sourceUpdatedAt: new Date('2026-10-30T08:01:12Z'),
      ingestedAt: now,
    });
  });

  it('carries volume, issue and pages for citations', async () => {
    const work = aCrossrefWork({ volume: '35', issue: '04', page: '528-537' });
    const article = articleOf(await mapWork(work, { now }));
    expect(article).toMatchObject({ volume: '35', issue: '04', pages: '528-537' });
  });

  it('lowercases the DOI', async () => {
    const article = articleOf(
      await mapWork(aCrossrefWork({ DOI: '10.1055/A-2236-8949' }), { now }),
    );
    expect(article.doi).toBe('10.1055/a-2236-8949');
  });

  it('leaves the abstract out when there is none, never inventing one', async () => {
    const article = articleOf(await mapWork(aCrossrefWork({ abstract: undefined }), { now }));
    expect(article).not.toHaveProperty('abstract');
  });

  it('leaves the abstract out when it only cites another article', async () => {
    const abstract = '<jats:p>Smith J, Doe A. A trial. Lancet 2021; 397: 100–110</jats:p>';
    const article = articleOf(await mapWork(aCrossrefWork({ abstract }), { now }));
    expect(article).not.toHaveProperty('abstract');
  });

  it('keeps an English abstract under a German title and records the deposit language', async () => {
    const work = aCrossrefWork({ title: ['Herzinsuffizienz im Alter'], language: 'de' });
    const article = articleOf(await mapWork(work, { now }));
    expect(article).toMatchObject({ title: 'Herzinsuffizienz im Alter', language: 'de' });
  });

  it.each([
    ['EN-us', 'en'],
    ['english', undefined],
    ['', undefined],
  ])('maps the language "%s" to %s', async (language, expected) => {
    const article = articleOf(await mapWork(aCrossrefWork({ language }), { now }));
    expect(article.language).toBe(expected);
  });

  it('accepts records without authors and with a year-only date', async () => {
    const work = aCrossrefWork({ author: undefined, published: { 'date-parts': [[2024]] } });
    expect(articleOf(await mapWork(work, { now }))).toMatchObject({
      authors: [],
      published: { year: 2024 },
    });
  });

  it('cleans markup and NFD characters out of the title and subtitle', async () => {
    const work = aCrossrefWork({ title: ['<i>In vivo</i> Gefäße'], subtitle: ['A &amp; B'] });
    expect(articleOf(await mapWork(work, { now }))).toMatchObject({
      title: 'In vivo Gefäße',
      subtitle: 'A & B',
    });
  });

  it('falls back to the DOI resolver when the deposit has no usable landing page', async () => {
    const work = aCrossrefWork({ resource: { primary: { URL: 'javascript:alert(1)' } } });
    expect(articleOf(await mapWork(work, { now })).landingUrl).toBe(
      'https://doi.org/10.1055/a-2236-8949',
    );
  });

  describe('licence gate', () => {
    const license = (URL: string, version: string, start: string) => ({
      URL,
      'content-version': version,
      start: { 'date-time': start },
    });

    it('treats an article under a future-dated licence as closed until it starts', async () => {
      const work = aCrossrefWork({
        license: [
          license('https://creativecommons.org/licenses/by/4.0/', 'vor', '2027-01-01T00:00:00Z'),
        ],
      });
      const article = articleOf(await mapWork(work, { now }));
      expect(article.isOpenAccess).toBe(false);
      expect(article.licenses).toHaveLength(1);
    });

    it('opens it once the embargo has passed', async () => {
      const work = aCrossrefWork({
        license: [
          license('https://creativecommons.org/licenses/by/4.0/', 'vor', '2026-11-01T00:00:00Z'),
        ],
      });
      expect(articleOf(await mapWork(work, { now })).isOpenAccess).toBe(true);
    });

    it('decides by the version-of-record licence, not an accepted-manuscript one', async () => {
      const work = aCrossrefWork({
        license: [
          license('https://creativecommons.org/licenses/by/4.0/', 'am', '2024-01-01T00:00:00Z'),
          license('https://www.thieme.de/tdm', 'vor', '2024-01-01T00:00:00Z'),
        ],
      });
      expect(articleOf(await mapWork(work, { now })).isOpenAccess).toBe(false);
    });

    it('treats an unknown licence as closed, metadata only', async () => {
      const article = articleOf(await mapWork(aCrossrefWork({ license: undefined }), { now }));
      expect(article).toMatchObject({ isOpenAccess: false, licenses: [] });
    });
  });

  describe('retractions and notices', () => {
    it('marks a retracted article', async () => {
      const work = aCrossrefWork({
        'updated-by': [{ DOI: '10.1055/a-2575-5491', type: 'retraction' }],
      });
      expect(articleOf(await mapWork(work, { now })).isRetracted).toBe(true);
    });

    it('marks an article retracted when a notice elsewhere says so', async () => {
      const article = articleOf(await mapWork(aCrossrefWork(), { now, knownRetracted: true }));
      expect(article.isRetracted).toBe(true);
    });

    it('dates the change to the notice when it is later than the deposit', async () => {
      const updatedAt = new Date('2026-11-01T00:00:00Z');
      const article = articleOf(await mapWork(aCrossrefWork(), { now, updatedAt }));
      expect(article.sourceUpdatedAt).toEqual(updatedAt);
    });

    it('keeps the deposit date when it is later than the notice', async () => {
      const updatedAt = new Date('2020-01-01T00:00:00Z');
      const article = articleOf(await mapWork(aCrossrefWork(), { now, updatedAt }));
      expect(article.sourceUpdatedAt).toEqual(new Date('2026-10-30T08:01:12Z'));
    });

    it('skips a retraction notice and reports what it retracts', async () => {
      const work = aCrossrefWork({
        DOI: '10.1055/a-2575-5491',
        title: ['Retraction Note: Prediction of survival'],
        'update-to': [{ DOI: '10.1055/a-2458-7088', type: 'retraction' }],
      });
      expect(await mapWork(work, { now })).toEqual({
        kind: 'skipped',
        reason: 'notice',
        doi: '10.1055/a-2575-5491',
        retracts: ['10.1055/a-2458-7088'],
      });
    });

    it('skips an erratum flagged only by its title', async () => {
      const work = aCrossrefWork({ title: ['Erratum: Antikoagulation und Antidote'] });
      expect(await mapWork(work, { now })).toMatchObject({ kind: 'skipped', reason: 'notice' });
    });
  });

  describe('records that cannot be articles', () => {
    it('skips other record types', async () => {
      expect(await mapWork(aCrossrefWork({ type: 'book-chapter' }), { now })).toMatchObject({
        kind: 'skipped',
        reason: 'other-type',
      });
    });

    it.each([
      ['no title', { title: undefined }, 'title'],
      ['no ISSN', { 'issn-type': [], ISSN: [] }, 'journal'],
      ['no journal name', { 'container-title': [] }, 'journal.name'],
      ['no date', { published: undefined, issued: undefined }, 'published'],
      ['a malformed DOI', { DOI: 'not-a-doi' }, 'doi'],
    ])('skips a record with %s and names the failing field', async (_case, changes, field) => {
      const mapped = await mapWork(aCrossrefWork(changes), { now });
      expect(mapped).toMatchObject({ kind: 'skipped', reason: 'invalid' });
      expect(mapped.kind === 'skipped' && mapped.problems).toContain(field);
    });
  });

  describe('content hash', () => {
    it('is stable for the same content, whatever the deposit or ingestion time', async () => {
      const first = articleOf(await mapWork(aCrossrefWork(), { now }));
      const again = articleOf(
        await mapWork(aCrossrefWork({ deposited: { 'date-time': '2026-11-01T00:00:00Z' } }), {
          now: new Date('2026-11-02T11:00:00Z'),
        }),
      );
      expect(again.contentHash).toBe(first.contentHash);
    });

    it('changes when the content changes', async () => {
      const first = articleOf(await mapWork(aCrossrefWork(), { now }));
      const edited = articleOf(await mapWork(aCrossrefWork({ title: ['Another title'] }), { now }));
      expect(edited.contentHash).not.toBe(first.contentHash);
    });
  });
});
