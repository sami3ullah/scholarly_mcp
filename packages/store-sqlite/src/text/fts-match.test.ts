import { describe, expect, it } from 'vitest';
import { trigramStems } from '@scholarly-mcp/lexical';
import { mainMatch, trigramMatch } from './fts-match.js';

describe('FTS match expressions', () => {
  it('is undefined when no word is left', () => {
    expect(mainMatch(['', '--', '"'], undefined)).toBeUndefined();
    expect(trigramMatch(trigramStems(['ab'], undefined))).toBeUndefined();
  });

  it('quotes every word, so query syntax stays text', () => {
    const match = mainMatch(['NEAR(a', 'AND'], undefined) ?? '';
    expect(match).not.toMatch(/(^|[^"])\b(NEAR|AND)\b(?!")/);
    expect(match).toContain('"near"');
    expect(match).toContain('"and"');
  });

  it('looks for stems of long words as substrings', () => {
    expect(trigramMatch(trigramStems(['Vorhofflimmern'], undefined))).toBe(
      '"vorhofflimm" OR "vorhofflimmern"',
    );
  });

  it('stems in the query language alone when it is known', () => {
    expect(mainMatch(['patients'], 'en')).toBe(
      '({text_stemmed title_stemmed} : ("patient") OR text_folded : "patients")',
    );
    expect(trigramMatch(trigramStems(['Vorhofflimmern'], 'de'))).toBe('"vorhofflimm"');
  });
});
