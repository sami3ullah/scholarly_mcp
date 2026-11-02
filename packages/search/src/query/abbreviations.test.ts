import { describe, expect, it } from 'vitest';
import { expandAbbreviations } from './abbreviations.js';

describe('expandAbbreviations', () => {
  it('expands a German abbreviation into both languages and its English abbreviation', () => {
    expect(expandAbbreviations(['VHF'])).toEqual(['AF', 'atrial fibrillation', 'Vorhofflimmern']);
  });

  it('expands an English abbreviation into its German one', () => {
    expect(expandAbbreviations(['AF'])).toContain('VHF');
  });

  it.each([['COPD'], ['KHK'], ['EKG'], ['MRT'], ['TVT'], ['NOAK']])('knows %s', (abbreviation) => {
    expect(expandAbbreviations([abbreviation]).length).toBeGreaterThan(0);
  });

  it('accepts lowercase abbreviations of three letters or more', () => {
    expect(expandAbbreviations(['copd'])).toContain('chronic obstructive pulmonary disease');
  });

  it('needs capitals for two-letter abbreviations, which are ordinary words too', () => {
    expect(expandAbbreviations(['ms', 'pe'])).toEqual([]);
    expect(expandAbbreviations(['MS'])).toContain('multiple sclerosis');
  });

  it('does not read a lowercase stopword as an abbreviation', () => {
    expect(expandAbbreviations(['its'])).toEqual([]);
    expect(expandAbbreviations(['ITS'])).toContain('intensive care unit');
  });

  it('does not repeat an abbreviation already in the query', () => {
    expect(expandAbbreviations(['AF', 'VHF'])).not.toContain('AF');
  });

  it('leaves ordinary words alone', () => {
    expect(expandAbbreviations(['rivaroxaban', 'dosing'])).toEqual([]);
  });
});
