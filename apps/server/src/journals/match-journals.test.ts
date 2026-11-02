import { isAppError, type JournalSummary } from '@scholarly-mcp/core';
import { describe, expect, it } from 'vitest';
import { asIssn, findJournals, resolveJournal } from './match-journals.js';

const journal = (name: string, issnPrint: string, articleCount = 10): JournalSummary => ({
  name,
  issnPrint,
  articleCount,
  openAccessCount: 0,
  firstYear: 2024,
  lastYear: 2026,
  subjects: [],
});

const dmw = {
  ...journal('DMW - Deutsche Medizinische Wochenschrift', '0012-0472', 1234),
  issnElectronic: '1439-4413',
};
const zbl = journal('Zentralblatt für Chirurgie', '0044-409X', 300);
const chirurg = journal('Der Chirurg', '0009-4722', 50);
const dermatologie = journal('Aktuelle Dermatologie', '0340-2541', 120);
const urologie = journal('Aktuelle Urologie', '0001-7868', 200);
const all = [dmw, zbl, chirurg, dermatologie, urologie];

const errorOf = (input: string) => {
  try {
    resolveJournal(all, input);
  } catch (error) {
    return isAppError(error)
      ? { code: error.code, field: error.field, message: error.message }
      : error;
  }
  return undefined;
};

describe('asIssn', () => {
  it.each([
    ['0044-409x', '0044-409X'],
    ['0044409X', '0044-409X'],
    [' 0012-0472 ', '0012-0472'],
    ['0012-04720', undefined],
    ['DMW', undefined],
  ])('reads %j as %j', (text, expected) => {
    expect(asIssn(text)).toBe(expected);
  });
});

describe('findJournals', () => {
  it('finds a journal by its print or electronic ISSN', () => {
    expect(findJournals(all, '1439-4413')).toEqual([dmw]);
    expect(findJournals(all, '0044409x')).toEqual([zbl]);
  });

  it('matches names regardless of case and umlaut spelling', () => {
    expect(findJournals(all, 'zentralblatt fuer chirurgie')).toEqual([zbl]);
  });

  it('lets the last word be cut short', () => {
    expect(findJournals(all, 'deutsche medizinische woch')).toEqual([dmw]);
  });

  it('ranks names starting with the query before names containing it, then by size', () => {
    expect(findJournals(all, 'aktuelle')).toEqual([urologie, dermatologie]);
    expect(findJournals(all, 'chirurg')).toEqual([chirurg, zbl]);
  });

  it('finds nothing for an unknown name or only punctuation', () => {
    expect(findJournals(all, 'Lancet')).toEqual([]);
    expect(findJournals(all, '--')).toEqual([]);
  });
});

describe('resolveJournal', () => {
  it('resolves a unique name or an ISSN', () => {
    expect(resolveJournal(all, 'DMW')).toBe(dmw);
    expect(resolveJournal(all, '0001-7868')).toBe(urologie);
  });

  it('takes a journal whose whole name was given even when others contain it', () => {
    expect(resolveJournal(all, 'Der Chirurg')).toBe(chirurg);
  });

  it('names the candidates and their ISSNs when the name is ambiguous', () => {
    expect(errorOf('Aktuelle')).toEqual({
      code: 'INVALID_INPUT',
      field: 'journal',
      message: expect.stringContaining(
        'Aktuelle Urologie (0001-7868); Aktuelle Dermatologie (0340-2541)',
      ) as string,
    });
  });

  it('is INVALID_INPUT on journal for an unknown journal or ISSN', () => {
    expect(errorOf('Lancet')).toMatchObject({ code: 'INVALID_INPUT', field: 'journal' });
    expect(errorOf('1234-5678')).toMatchObject({ code: 'INVALID_INPUT', field: 'journal' });
  });
});
