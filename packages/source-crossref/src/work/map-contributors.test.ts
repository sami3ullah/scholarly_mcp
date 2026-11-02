import { describe, expect, it } from 'vitest';
import { aCrossrefWork } from '../testing/a-crossref-work.js';
import { mapAuthors, mapJournal } from './map-contributors.js';

describe('mapAuthors', () => {
  it('maps names and reduces the ORCID URL to the bare iD', () => {
    expect(mapAuthors(aCrossrefWork())).toEqual([
      { given: 'Stefan', family: 'Bräse', orcid: '0000-0003-4845-3191' },
    ]);
  });

  it('keeps an organisation author as a family name', () => {
    const work = aCrossrefWork({ author: [{ name: 'Deutsche Gesellschaft für Kardiologie' }] });
    expect(mapAuthors(work)).toEqual([{ family: 'Deutsche Gesellschaft für Kardiologie' }]);
  });

  it('drops a malformed ORCID but keeps the author', () => {
    const work = aCrossrefWork({
      author: [{ family: 'Lovelace', ORCID: 'https://orcid.org/123' }],
    });
    expect(mapAuthors(work)).toEqual([{ family: 'Lovelace' }]);
  });

  it('skips nameless entries and tidies whitespace and NFD names', () => {
    const work = aCrossrefWork({
      author: [
        { given: 'Anna' },
        { family: ' ', given: 'X' },
        { given: ' Jo ', family: 'Müller\n' },
      ],
    });
    expect(mapAuthors(work)).toEqual([{ given: 'Jo', family: 'Müller' }]);
  });

  it('returns no authors when Crossref has none', () => {
    expect(mapAuthors(aCrossrefWork({ author: undefined }))).toEqual([]);
  });
});

describe('mapJournal', () => {
  it('maps the container title and typed ISSNs', () => {
    expect(mapJournal(aCrossrefWork())).toEqual({
      name: 'Synlett',
      issnPrint: '0936-5214',
      issnElectronic: '1437-2096',
    });
  });

  it('keeps an electronic-only journal without a print ISSN', () => {
    const work = aCrossrefWork({ 'issn-type': [{ type: 'electronic', value: '2364-3722' }] });
    expect(mapJournal(work)).toEqual({ name: 'Synlett', issnElectronic: '2364-3722' });
  });

  it('stores an untyped ISSN as the print ISSN and fixes its spelling', () => {
    const work = aCrossrefWork({ 'issn-type': undefined, ISSN: ['1438881x'] });
    expect(mapJournal(work)).toEqual({ name: 'Synlett', issnPrint: '1438-881X' });
  });

  it('drops malformed ISSNs', () => {
    const work = aCrossrefWork({ 'issn-type': [{ type: 'print', value: '12-34' }], ISSN: [] });
    expect(mapJournal(work)).toEqual({ name: 'Synlett' });
  });
});
