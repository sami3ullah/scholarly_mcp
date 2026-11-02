import {
  mergeJournalTallies,
  subjectSchema,
  type JournalDirectory,
  type JournalTally,
} from '@scholarly-mcp/core';
import type { Db } from '../database/open-database.js';
import { withSignal } from '../with-signal.js';

interface TallyRow {
  readonly name: string;
  readonly issn_print: string | null;
  readonly issn_electronic: string | null;
  readonly article_count: number;
  readonly open_access_count: number;
  readonly first_year: number;
  readonly last_year: number;
}

interface SubjectRow {
  readonly name: string;
  readonly issn_print: string | null;
  readonly issn_electronic: string | null;
  readonly label: string;
  readonly origin: string;
  readonly article_count: number;
}

/*
 * One group per journal name and ISSN pair as the records carry them; core merges groups
 * that share an ISSN. Subjects are counted once per article, however often a record repeats
 * one. Both queries read every article, about 0.2 s on the 70k-article index, so callers
 * cache the result per index version.
 */
const TALLIES = `
SELECT json_extract(record, '$.journal.name') AS name, issn_print, issn_electronic,
  count(*) AS article_count, sum(is_open_access) AS open_access_count,
  min(year) AS first_year, max(year) AS last_year
FROM articles
GROUP BY name, issn_print, issn_electronic`;

const SUBJECTS = `
SELECT name, issn_print, issn_electronic, label, origin, count(DISTINCT doi) AS article_count
FROM (
  SELECT a.doi, json_extract(a.record, '$.journal.name') AS name, a.issn_print, a.issn_electronic,
    json_extract(s.value, '$.label') AS label, json_extract(s.value, '$.origin') AS origin
  FROM articles a, json_each(a.record, '$.subjects') s
)
GROUP BY name, issn_print, issn_electronic, label, origin`;

/** The index's journals, built from its articles with two aggregate queries. */
export function createJournalDirectory(db: Db): JournalDirectory {
  const tallies = db.prepare<[], TallyRow>(TALLIES);
  const subjects = db.prepare<[], SubjectRow>(SUBJECTS);

  return {
    journals: (signal) =>
      withSignal(signal, () => {
        const byGroup = new Map<string, JournalTally['subjects'][number][]>();
        for (const row of subjects.all()) {
          const subject = subjectSchema.parse({ label: row.label, origin: row.origin });
          const key = groupKey(row);
          byGroup.set(key, [
            ...(byGroup.get(key) ?? []),
            { ...subject, articleCount: row.article_count },
          ]);
        }
        return mergeJournalTallies(
          tallies.all().map((row) => ({
            name: row.name,
            ...(row.issn_print !== null && { issnPrint: row.issn_print }),
            ...(row.issn_electronic !== null && { issnElectronic: row.issn_electronic }),
            articleCount: row.article_count,
            openAccessCount: row.open_access_count,
            firstYear: row.first_year,
            lastYear: row.last_year,
            subjects: byGroup.get(groupKey(row)) ?? [],
          })),
        );
      }),
  };
}

function groupKey(row: Pick<TallyRow, 'name' | 'issn_print' | 'issn_electronic'>): string {
  return [row.name, row.issn_print ?? '', row.issn_electronic ?? ''].join('\u0000');
}
