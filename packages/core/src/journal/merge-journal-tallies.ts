import type { Subject } from '../article/subject.js';
import { JOURNAL_SUBJECT_LIMIT, type JournalSummary } from './journal-summary.js';

/**
 * Counts for a group of articles that share a journal name and ISSN pair. Stores tally in
 * whatever way suits them (SQL `GROUP BY`, a loop) and leave the merging to
 * {@link mergeJournalTallies}, so every store agrees on what a journal is.
 */
export interface JournalTally {
  readonly name: string;
  readonly issnPrint?: string;
  readonly issnElectronic?: string;
  readonly articleCount: number;
  readonly openAccessCount: number;
  readonly firstYear: number;
  readonly lastYear: number;
  readonly subjects: readonly (Subject & { readonly articleCount: number })[];
}

/**
 * Merges tallies into one summary per journal. Records of one journal differ: some carry
 * only the print ISSN, some both, and names vary ("DMW" and "DMW - Deutsche Medizinische
 * Wochenschrift"), so tallies sharing any ISSN are one journal, named after the variant
 * most articles carry. Sorted by name, then ISSN, so the order is stable.
 */
export function mergeJournalTallies(tallies: readonly JournalTally[]): JournalSummary[] {
  const groups = groupBySharedIssn(tallies);
  return groups
    .map(summarize)
    .sort((a, b) => a.name.localeCompare(b.name) || issnKey(a).localeCompare(issnKey(b)));
}

function summarize(group: readonly JournalTally[]): JournalSummary {
  const names = new Map<string, number>();
  const subjects = new Map<string, Subject & { articleCount: number }>();
  for (const tally of group) {
    names.set(tally.name, (names.get(tally.name) ?? 0) + tally.articleCount);
    for (const subject of tally.subjects) {
      const key = `${subject.origin}\u0000${subject.label}`;
      const seen = subjects.get(key);
      subjects.set(key, {
        label: subject.label,
        origin: subject.origin,
        articleCount: (seen?.articleCount ?? 0) + subject.articleCount,
      });
    }
  }
  const issnPrint = group.find((tally) => tally.issnPrint !== undefined)?.issnPrint;
  const issnElectronic = group.find((tally) => tally.issnElectronic !== undefined)?.issnElectronic;
  return {
    name: mostFrequent(names),
    ...(issnPrint !== undefined && { issnPrint }),
    ...(issnElectronic !== undefined && { issnElectronic }),
    articleCount: sum(group, 'articleCount'),
    openAccessCount: sum(group, 'openAccessCount'),
    firstYear: Math.min(...group.map((tally) => tally.firstYear)),
    lastYear: Math.max(...group.map((tally) => tally.lastYear)),
    subjects: [...subjects.values()]
      .sort((a, b) => b.articleCount - a.articleCount || a.label.localeCompare(b.label))
      .slice(0, JOURNAL_SUBJECT_LIMIT),
  };
}

/** Union-find over ISSNs: tallies linked through any shared ISSN end up in one group. */
function groupBySharedIssn(tallies: readonly JournalTally[]): JournalTally[][] {
  const parent = tallies.map((_, index) => index);
  const root = (index: number): number => {
    let current = index;
    while (parent[current] !== current) current = parent[current] ?? current;
    return current;
  };
  const owner = new Map<string, number>();
  tallies.forEach((tally, index) => {
    for (const issn of [tally.issnPrint, tally.issnElectronic]) {
      if (issn === undefined) continue;
      const other = owner.get(issn);
      if (other === undefined) owner.set(issn, index);
      else parent[root(index)] = root(other);
    }
  });
  const groups = new Map<number, JournalTally[]>();
  tallies.forEach((tally, index) => {
    const key = root(index);
    groups.set(key, [...(groups.get(key) ?? []), tally]);
  });
  return [...groups.values()];
}

function mostFrequent(counts: ReadonlyMap<string, number>): string {
  let best = '';
  let bestCount = -1;
  for (const [name, count] of counts) {
    if (count > bestCount || (count === bestCount && name.localeCompare(best) < 0)) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

function sum(group: readonly JournalTally[], field: 'articleCount' | 'openAccessCount'): number {
  return group.reduce((total, tally) => total + tally[field], 0);
}

function issnKey(journal: JournalSummary): string {
  return journal.issnPrint ?? journal.issnElectronic ?? '';
}
