import { describe, expect, it } from 'vitest';
import { WHY_MATCHED_MAX_LENGTH, whyMatched } from './why-matched.js';

const results = {
  text: 'Rivaroxaban dosing was lower in elderly patients.',
  section: 'Results',
  origin: 'abstract',
} as const;

describe('whyMatched', () => {
  it('names the section and the query terms found in the chunk', () => {
    expect(
      whyMatched({ chunk: results, title: 'T', terms: ['rivaroxaban', 'patient', 'stroke'] }),
    ).toBe('Matched in Results: rivaroxaban, patient');
  });

  it('matches German inflections and compounds by a shared prefix', () => {
    expect(
      whyMatched({
        chunk: { text: 'Die Vorhofflimmertherapie bei Ärzten', origin: 'abstract' },
        title: 'T',
        terms: ['Vorhofflimmern', 'Aerzte'],
      }),
    ).toBe('Matched in abstract: Vorhofflimmern, Aerzte');
  });

  it('needs every word of an expansion', () => {
    expect(
      whyMatched({ chunk: results, title: 'T', terms: ['atrial fibrillation', 'dosing'] }),
    ).toBe('Matched in Results: dosing');
  });

  it('falls back to the title when the chunk has none of the terms', () => {
    expect(whyMatched({ chunk: results, title: 'Stroke prevention', terms: ['stroke'] })).toBe(
      'Matched in title: stroke',
    );
  });

  it('says the match was by meaning when no term occurs', () => {
    expect(whyMatched({ chunk: results, title: 'T', terms: ['Blutung'] })).toBe(
      'Related in meaning (Results)',
    );
  });

  it('labels title-only chunks and full-text chunks', () => {
    expect(
      whyMatched({
        chunk: { text: 'Stroke', origin: 'metadata' },
        title: 'Stroke',
        terms: ['stroke'],
      }),
    ).toBe('Matched in title: stroke');
    expect(
      whyMatched({
        chunk: { text: 'x', section: 'Methods', origin: 'fulltext' },
        title: 'T',
        terms: [],
      }),
    ).toBe('Related in meaning (Methods (full text))');
  });

  it('says the article was found by its DOI', () => {
    expect(whyMatched({ chunk: undefined, title: 'T', terms: [] })).toBe('Matched by DOI');
  });

  it('fits the card limit however many terms match', () => {
    const terms = Array.from({ length: 40 }, (_, index) => `term${String(index)}`);
    const label = whyMatched({
      chunk: { text: terms.join(' '), origin: 'abstract' },
      title: 'T',
      terms,
    });
    expect(label.length).toBeLessThanOrEqual(WHY_MATCHED_MAX_LENGTH);
    expect(label).toMatch(/^Matched in abstract: term0, term1/);
  });
});
