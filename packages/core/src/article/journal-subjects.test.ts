import { describe, expect, it } from 'vitest';
import {
  journalSubjectsOf,
  journalSubjectsPresetSchema,
  withJournalSubjects,
} from './journal-subjects.js';

const preset = journalSubjectsPresetSchema.parse([
  {
    name: 'Endoscopy',
    issns: ['0013-726X', '1438-8812'],
    subjects: ['Endoscopy', 'Gastroenterology'],
  },
]);
const catalog = journalSubjectsOf(preset);
const endoscopy = { name: 'Endoscopy', issnElectronic: '1438-8812' };
const journalLevel = [
  { label: 'Endoscopy', origin: 'journal' },
  { label: 'Gastroenterology', origin: 'journal' },
] as const;

describe('journalSubjectsPresetSchema', () => {
  it('rejects an ISSN listed under two journals', () => {
    const twice = [
      { name: 'A', issns: ['0013-726X'], subjects: ['X'] },
      { name: 'B', issns: ['0013-726X'], subjects: ['Y'] },
    ];
    expect(journalSubjectsPresetSchema.safeParse(twice).success).toBe(false);
  });

  it('rejects a journal without subjects or a malformed ISSN', () => {
    expect(
      journalSubjectsPresetSchema.safeParse([{ name: 'A', issns: ['0013-726X'], subjects: [] }])
        .success,
    ).toBe(false);
    expect(
      journalSubjectsPresetSchema.safeParse([{ name: 'A', issns: ['13726X'], subjects: ['X'] }])
        .success,
    ).toBe(false);
  });
});

describe('withJournalSubjects', () => {
  it('adds journal-level subjects when there is no enrichment, matching either ISSN', () => {
    expect(withJournalSubjects(undefined, endoscopy, catalog)).toEqual({ subjects: journalLevel });
    const print = { name: 'Endoscopy', issnPrint: '0013-726X' };
    expect(withJournalSubjects(undefined, print, catalog)?.subjects).toEqual(journalLevel);
  });

  it('adds them when the enricher found the article but no subjects, keeping its full text', () => {
    const fullText = {
      source: 'europepmc',
      id: 'PMC1',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      revision: '1',
    } as const;
    const enrichment = { subjects: [], fullText };
    expect(withJournalSubjects(enrichment, endoscopy, catalog)).toEqual({
      subjects: journalLevel,
      fullText,
    });
  });

  it('leaves article-level subjects alone', () => {
    const enrichment = { subjects: [{ label: 'Colonoscopy', origin: 'mesh' }] } as const;
    expect(withJournalSubjects(enrichment, endoscopy, catalog)).toBe(enrichment);
  });

  it('changes nothing for a journal the preset does not list', () => {
    expect(
      withJournalSubjects(undefined, { name: 'Other', issnPrint: '1234-5678' }, catalog),
    ).toBeUndefined();
  });
});
