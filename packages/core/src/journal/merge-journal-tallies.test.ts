import { describe, expect, it } from 'vitest';
import { journalSummarySchema } from './journal-summary.js';
import { mergeJournalTallies, type JournalTally } from './merge-journal-tallies.js';

const tally = (overrides: Partial<JournalTally>): JournalTally => ({
  name: 'DMW - Deutsche Medizinische Wochenschrift',
  articleCount: 1,
  openAccessCount: 0,
  firstYear: 2024,
  lastYear: 2024,
  subjects: [],
  ...overrides,
});

describe('mergeJournalTallies', () => {
  it('joins records that share any ISSN, even through a third record', () => {
    const journals = mergeJournalTallies([
      tally({ issnPrint: '0012-0472', articleCount: 3 }),
      tally({ issnElectronic: '1439-4413', articleCount: 2 }),
      tally({ issnPrint: '0012-0472', issnElectronic: '1439-4413', articleCount: 5 }),
    ]);
    expect(journals).toHaveLength(1);
    expect(journals[0]).toMatchObject({
      issnPrint: '0012-0472',
      issnElectronic: '1439-4413',
      articleCount: 10,
    });
  });

  it('names a journal after the variant most articles carry', () => {
    const [journal] = mergeJournalTallies([
      tally({ name: 'DMW', issnPrint: '0012-0472', articleCount: 2 }),
      tally({ issnPrint: '0012-0472', articleCount: 7 }),
    ]);
    expect(journal?.name).toBe('DMW - Deutsche Medizinische Wochenschrift');
  });

  it('keeps journals without a shared ISSN apart, sorted by name', () => {
    const journals = mergeJournalTallies([
      tally({ name: 'Zentralblatt für Chirurgie', issnPrint: '0044-409X' }),
      tally({ name: 'Aktuelle Urologie', issnPrint: '0001-7868' }),
    ]);
    expect(journals.map(({ name }) => name)).toEqual([
      'Aktuelle Urologie',
      'Zentralblatt für Chirurgie',
    ]);
  });

  it('adds up open access counts and spans the years', () => {
    const [journal] = mergeJournalTallies([
      tally({ issnPrint: '0012-0472', openAccessCount: 1, firstYear: 2024, lastYear: 2024 }),
      tally({ issnPrint: '0012-0472', openAccessCount: 2, firstYear: 2025, lastYear: 2026 }),
    ]);
    expect(journal).toMatchObject({ openAccessCount: 3, firstYear: 2024, lastYear: 2026 });
  });

  it('keeps the ten most frequent subjects, counting each label and origin once', () => {
    const subjects = Array.from({ length: 12 }, (_, index) => ({
      label: `Subject ${String(index).padStart(2, '0')}`,
      origin: 'mesh' as const,
      articleCount: index + 1,
    }));
    const [journal] = mergeJournalTallies([
      tally({ issnPrint: '0012-0472', subjects }),
      tally({
        issnPrint: '0012-0472',
        subjects: [{ label: 'Subject 00', origin: 'mesh', articleCount: 20 }],
      }),
    ]);
    expect(journal?.subjects).toHaveLength(10);
    expect(journal?.subjects[0]).toEqual({ label: 'Subject 00', origin: 'mesh', articleCount: 21 });
    expect(journalSummarySchema.parse(journal)).toEqual(journal);
  });

  it('returns nothing for no tallies', () => {
    expect(mergeJournalTallies([])).toEqual([]);
  });
});
