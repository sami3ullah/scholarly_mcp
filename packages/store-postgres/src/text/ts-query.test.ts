import { trigramStems } from '@scholarly-mcp/lexical';
import { describe, expect, it } from 'vitest';
import { COMMON_WORD_SHARE, containsPatterns, queryWords, weighWords } from './ts-query.js';

describe('tsquery text', () => {
  it('is empty when no word is left', () => {
    expect(queryWords(['', '--', "'", '&!|'], undefined)).toEqual([]);
  });

  it('quotes every word, so query syntax stays text', () => {
    expect(queryWords(['a&b', 'NOT!'], 'en').map(({ query }) => query)).toEqual([
      "('a':AB | 'a':C)",
      "('b':AB | 'b':C)",
      "('not':AB | 'not':C)",
    ]);
  });

  it('looks for stems in title and stemmed text, the folded word in folded text', () => {
    expect(queryWords(['patients'], 'en')).toEqual([
      { query: "('patient':AB | 'patients':C)", lexemes: ['patient', 'patients'] },
    ]);
    expect(queryWords(['Ärzte'], undefined)).toEqual([
      { query: "('aerzt':AB | 'aerzte':C)", lexemes: ['aerzt', 'aerzte'] },
    ]);
  });

  it('keeps each word once, so a repeated word does not count twice', () => {
    expect(queryWords(['Ärzte', 'aerzte', 'ÄRZTE'], 'de')).toHaveLength(1);
  });

  it('drops words too long to be a lexeme', () => {
    expect(queryWords(['x'.repeat(3000)], 'en')).toEqual([]);
  });

  it('weighs a rare word above a common one, by its most frequent lexeme', () => {
    const words = queryWords(['patients', 'borreliosis'], 'en');
    const counts = new Map([
      ['patient', 400],
      ['patients', 300],
      ['borreliosi', 3],
    ]);
    const [common, rare] = weighWords(words, counts, 1000);
    expect(common?.idf).toBeCloseTo(Math.log(1 + 600.5 / 400.5));
    expect(rare?.idf).toBeGreaterThan(common?.idf ?? Infinity);
  });

  it('picks candidates by the rarer words only, unless every word is common', () => {
    const words = queryWords(['patients', 'borreliosis'], 'en');
    const common = COMMON_WORD_SHARE * 1000 + 1;
    const both = new Map([
      ['patient', common],
      ['borreliosi', 3],
    ]);
    expect(weighWords(words, both, 1000).map(({ matches }) => matches)).toEqual([false, true]);
    const allCommon = new Map([
      ['patient', common],
      ['borreliosi', common],
    ]);
    expect(weighWords(words, allCommon, 1000).map(({ matches }) => matches)).toEqual([true, true]);
  });

  it('treats a word as found in every chunk when the total lags behind its count', () => {
    const [word] = weighWords(queryWords(['patients'], 'en'), new Map([['patient', 50]]), 0);
    expect(word).toMatchObject({ idf: Math.log(1 + 0.5 / 50.5), matches: true });
  });

  it('escapes LIKE wildcards in trigram patterns', () => {
    expect(containsPatterns(['50%_a\\'])).toEqual(['%50\\%\\_a\\\\%']);
    expect(containsPatterns(trigramStems(['Vorhofflimmern'], 'de'))).toEqual(['%vorhofflimm%']);
  });
});
