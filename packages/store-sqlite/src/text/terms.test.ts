import { describe, expect, it } from 'vitest';
import { foldText } from './fold-text.js';
import { mainMatch, trigramMatch } from './fts-match.js';
import { foldedWords, stemWord, stemmedText } from './terms.js';

describe('foldText', () => {
  it.each([
    ['Ärzte', 'Aerzte'],
    ['Straße', 'Strasse'],
    ['Übelkeit', 'Uebelkeit'],
    ['Größe', 'Groesse'],
  ])('folds %s and %s to the same text', (a, b) => {
    expect(foldText(a)).toBe(foldText(b));
  });

  it('treats NFD umlauts like NFC ones', () => {
    expect(foldText('Ärzte')).toBe(foldText('Ärzte'));
  });

  it('strips other diacritics', () => {
    expect(foldText('Café Señor')).toBe('cafe senor');
  });
});

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

describe('FTS match expressions', () => {
  it('is undefined when no word is left', () => {
    expect(mainMatch(['', '--', '"'])).toBeUndefined();
    expect(trigramMatch(['ab'])).toBeUndefined();
  });

  it('quotes every word, so query syntax stays text', () => {
    const match = mainMatch(['NEAR(a', 'AND']) ?? '';
    expect(match).not.toMatch(/(^|[^"])\b(NEAR|AND)\b(?!")/);
    expect(match).toContain('"near"');
    expect(match).toContain('"and"');
  });

  it('looks for stems of long words as substrings', () => {
    expect(trigramMatch(['Vorhofflimmern'])).toBe('"vorhofflimm" OR "vorhofflimmern"');
  });
});
