import {
  mergeJournalTallies,
  subjectSchema,
  type JournalDirectory,
  type JournalTally,
} from '@scholarly-mcp/core';
import { query, type Pool } from '../database/pool.js';

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
 * As in SQLite: one group per journal name and ISSN pair as the records carry them, merged
 * in core when groups share an ISSN, and subjects counted once per article. Both queries
 * read every article, so callers cache the result per index version.
 */
const tallies = (s: string) => `
SELECT record->'journal'->>'name' AS name, issn_print, issn_electronic,
  count(*)::int AS article_count, count(*) FILTER (WHERE is_open_access)::int AS open_access_count,
  min(year) AS first_year, max(year) AS last_year
FROM ${s}.articles
GROUP BY 1, 2, 3`;

const subjects = (s: string) => `
SELECT a.record->'journal'->>'name' AS name, a.issn_print, a.issn_electronic,
  subject->>'label' AS label, subject->>'origin' AS origin,
  count(DISTINCT a.doi)::int AS article_count
FROM ${s}.articles a, jsonb_array_elements(a.record->'subjects') subject
GROUP BY 1, 2, 3, 4, 5`;

/** The index's journals, built from its articles with two aggregate queries. */
export function createJournalDirectory(pool: Pool, s: string): JournalDirectory {
  return {
    journals: async (signal) => {
      const [tallyRows, subjectRows] = await Promise.all([
        query<TallyRow>(pool, signal, tallies(s)),
        query<SubjectRow>(pool, signal, subjects(s)),
      ]);
      const byGroup = new Map<string, JournalTally['subjects'][number][]>();
      for (const row of subjectRows.rows) {
        const subject = subjectSchema.parse({ label: row.label, origin: row.origin });
        const key = groupKey(row);
        byGroup.set(key, [
          ...(byGroup.get(key) ?? []),
          { ...subject, articleCount: row.article_count },
        ]);
      }
      return mergeJournalTallies(
        tallyRows.rows.map((row) => ({
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
    },
  };
}

function groupKey(row: Pick<TallyRow, 'name' | 'issn_print' | 'issn_electronic'>): string {
  return [row.name, row.issn_print ?? '', row.issn_electronic ?? ''].join('\u0000');
}
