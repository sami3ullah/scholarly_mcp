import type { CrossrefWork } from '../work/crossref-work.js';

/** A plausible Crossref journal-article work, shaped like the recorded Thieme samples. */
export function aCrossrefWork(changes: Partial<CrossrefWork> = {}): CrossrefWork {
  return {
    DOI: '10.1055/a-2236-8949',
    type: 'journal-article',
    title: ['Design of Imidazo[1,2-a]pyridine-Based Donor–Acceptor Chromophores'],
    'container-title': ['Synlett'],
    ISSN: ['0936-5214', '1437-2096'],
    'issn-type': [
      { type: 'print', value: '0936-5214' },
      { type: 'electronic', value: '1437-2096' },
    ],
    author: [
      {
        given: 'Stefan',
        family: 'Bräse',
        ORCID: 'https://orcid.org/0000-0003-4845-3191',
      },
    ],
    published: { 'date-parts': [[2024, 2, 1]] },
    language: 'en',
    abstract: '<jats:title>Abstract</jats:title><jats:p>A series of chromophores.</jats:p>',
    license: [
      {
        URL: 'https://creativecommons.org/licenses/by/4.0/',
        'content-version': 'vor',
        start: { 'date-time': '2024-01-02T00:00:00Z' },
      },
    ],
    deposited: { 'date-time': '2026-10-30T08:01:12Z' },
    resource: { primary: { URL: 'http://www.thieme-connect.de/DOI/DOI?10.1055/a-2236-8949' } },
    ...changes,
  };
}
