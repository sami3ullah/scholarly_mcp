import { trigramStems } from '@scholarly-mcp/lexical';
import { describe, expect, it } from 'vitest';
import { containsPatterns, tsQueryText } from './ts-query.js';

describe('tsquery text', () => {
  it('is undefined when no word is left', () => {
    expect(tsQueryText(['', '--', "'", '&!|'], undefined)).toBeUndefined();
  });

  it('quotes every word, so query syntax stays text', () => {
    expect(tsQueryText(['a&b', 'NOT!'], 'en')).toBe(
      "('a':AB | 'a':C) | ('b':AB | 'b':C) | ('not':AB | 'not':C)",
    );
  });

  it('looks for stems in title and stemmed text, the folded word in folded text', () => {
    expect(tsQueryText(['patients'], 'en')).toBe("('patient':AB | 'patients':C)");
    expect(tsQueryText(['Ärzte'], undefined)).toBe("('aerzt':AB | 'aerzte':C)");
  });

  it('drops words too long to be a lexeme', () => {
    expect(tsQueryText(['x'.repeat(3000)], 'en')).toBeUndefined();
  });

  it('escapes LIKE wildcards in trigram patterns', () => {
    expect(containsPatterns(['50%_a\\'])).toEqual(['%50\\%\\_a\\\\%']);
    expect(containsPatterns(trigramStems(['Vorhofflimmern'], 'de'))).toEqual(['%vorhofflimm%']);
  });
});
