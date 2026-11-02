import { DEFAULT_FULLTEXT_LICENSES, normalizeDoi, type Doi } from '@scholarly-mcp/core';
import { describe, expect, it } from 'vitest';
import { NOW, articles, searchBody } from '../testing/europepmc-fixtures.js';
import { searchHitSchema, type SearchHit } from './search-hit.js';
import { chooseHits, fullTextRefOf, subjectsOf } from './to-enrichment.js';

const hits = searchBody.resultList.result.map((hit) => searchHitSchema.parse(hit));
const doi = (value: string) => normalizeDoi(value) as Doi;
const hitFor = (value: string) => hits.find((hit) => hit.doi === value) as SearchHit;
const allowlist = [...DEFAULT_FULLTEXT_LICENSES];

describe('chooseHits', () => {
  it('keeps only hits that state a requested DOI', () => {
    const wanted = new Set([doi('10.1055/a-2272-9794'), doi('10.1055/s-0042-1751569')]);
    expect([...chooseHits(hits, wanted).keys()]).toEqual([doi('10.1055/a-2272-9794')]);
  });

  it('ignores preprints and prefers a hit with a PMCID', () => {
    const base = { source: 'MED', doi: '10.1055/A-1' };
    const chosen = chooseHits(
      [
        { ...base, source: 'PPR', pmcid: 'PPR1' },
        base,
        { ...base, pmcid: 'PMC1' },
        { ...base, pmcid: 'PMC2' },
      ],
      new Set([doi('10.1055/a-1')]),
    );
    expect(chosen.get(doi('10.1055/a-1'))?.pmcid).toBe('PMC1');
  });
});

describe('subjectsOf', () => {
  it('keeps MeSH descriptors without check tags, and plain keywords', () => {
    const subjects = subjectsOf({
      source: 'MED',
      meshHeadingList: {
        meshHeading: [
          { descriptorName: 'Humans' },
          { descriptorName: 'Barrett Esophagus' },
          { descriptorName: 'Barrett Esophagus' },
        ],
      },
      keywordList: { keyword: ['[ <sup>177</sup> Lu]Lu-PSMA &amp; PET', 'x'.repeat(121), ' '] },
    });
    expect(subjects).toEqual([
      { label: 'Barrett Esophagus', origin: 'mesh' },
      { label: '[ 177 Lu]Lu-PSMA & PET', origin: 'keyword' },
    ]);
  });
});

describe('fullTextRefOf', () => {
  const hit = hitFor('10.1055/a-2272-9794');

  it('references the full text of an allowlisted version of record', () => {
    expect(fullTextRefOf(hit, articles.endoscopy, allowlist, NOW)).toEqual({
      source: 'europepmc',
      id: 'PMC11288659',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      revision: '2024-08-01',
    });
  });

  it.each([
    [
      'a licence off the allowlist',
      { allowlist: ['https://creativecommons.org/licenses/by-nc-nd/4.0/'] },
    ],
    ['an embargo', { now: new Date('2024-01-01T00:00:00Z') }],
    ['a retraction', { article: { ...articles.endoscopy, isRetracted: true } }],
    ['no open access copy', { hit: { ...hit, isOpenAccess: 'N' as const } }],
    ['an author manuscript', { hit: { ...hit, epmcAuthMan: 'Y' as const } }],
    ['no full text id', { hit: { ...hit, fullTextIdList: { fullTextId: [] } } }],
    ['another licence family', { hit: { ...hit, license: 'cc by-nc' } }],
    [
      'no revision date',
      { hit: { ...hit, fullTextReceivedDate: undefined, dateOfRevision: undefined } },
    ],
  ])('gives none for %s', (_case, change) => {
    const options = { hit, article: articles.endoscopy, allowlist, now: NOW, ...change };
    const cleaned = JSON.parse(JSON.stringify(options.hit)) as SearchHit;
    expect(fullTextRefOf(cleaned, options.article, options.allowlist, options.now)).toBeUndefined();
  });

  it('gives none for an article closed at Crossref, whatever Europe PMC holds', () => {
    expect(fullTextRefOf(hitFor('10.1055/a-2567-5178'), articles.manuscript, allowlist, NOW)).toBe(
      undefined,
    );
  });
});
