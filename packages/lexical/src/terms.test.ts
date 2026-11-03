import { describe, expect, it } from 'vitest';
import { hasStemAtWordEdge, trigramStems } from './compound-edges.js';
import { foldedWords, stemWord, stemmedText } from './terms.js';

describe('stemming', () => {
  it('splits on anything that is not a letter or digit', () => {
    expect(foldedWords('COVID-19: Ärzte (n=12)')).toEqual(['covid', '19', 'aerzte', 'n', '12']);
  });

  it('gives inflected German words one stem', () => {
    expect(stemWord('therapien', 'de')).toEqual(stemWord('therapie', 'de'));
  });

  it('gives inflected English words one stem', () => {
    expect(stemWord('studies', 'en')).toEqual(stemWord('study', 'en'));
  });

  it('stems with both languages when the language is unknown, without repeats', () => {
    expect(stemWord('therapien', undefined)).toEqual(['therapi', 'therapien']);
    expect(stemWord('studies', undefined)).toEqual(['studi']);
  });

  it('stems folded umlaut spellings alike', () => {
    expect(stemmedText('Ärzte', 'de')).toBe(stemmedText('Aerzte', 'de'));
  });
});

describe('compound stems', () => {
  it('looks for stems of long words only', () => {
    expect(trigramStems(['ab'], undefined)).toEqual([]);
    expect(trigramStems(['Vorhofflimmern'], undefined)).toEqual(['vorhofflimm', 'vorhofflimmern']);
    expect(trigramStems(['Vorhofflimmern'], 'de')).toEqual(['vorhofflimm']);
  });

  it('counts a stem only at a compound edge', () => {
    expect(hasStemAtWordEdge('Vorhofflimmertherapie', ['vorhofflimm'])).toBe(true);
    expect(hasStemAtWordEdge('Darmkrebses', ['krebs'])).toBe(true);
    expect(hasStemAtWordEdge('Defibrillation', ['fibrill'])).toBe(false);
  });
});
