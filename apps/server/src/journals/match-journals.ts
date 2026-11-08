import { appError, foldText, type JournalSummary } from '@scholarly-mcp/core';

/** How many journals a name lookup returns, and names in an ambiguity message. */
export const JOURNAL_MATCH_LIMIT = 5;

const ISSN = /^(\d{4})-?(\d{3}[\dX])$/i;

/** Returns the ISSN in its printed form (`1438-8812`) when the text is one, else undefined. */
export function asIssn(text: string): string | undefined {
  const match = ISSN.exec(text.trim());
  return match === null ? undefined : `${match[1] ?? ''}-${(match[2] ?? '').toUpperCase()}`;
}

/** The ISSNs a journal is known by, for the search filter. */
export function issnsOf(journal: JournalSummary): string[] {
  return [journal.issnPrint, journal.issnElectronic].filter(
    (issn): issn is string => issn !== undefined,
  );
}

/**
 * Finds journals by ISSN or by name. Names compare by folded words, so case, umlaut
 * spelling and punctuation do not count, and the last word may be cut short ("Dtsch Med
 * Wochenschr" style abbreviations still need whole leading words). Ranked: same name, then
 * names starting with the query, then names containing its words, whole before cut short;
 * more articles first within each.
 */
export function findJournals(journals: readonly JournalSummary[], query: string): JournalSummary[] {
  const issn = asIssn(query);
  if (issn !== undefined) return journals.filter((journal) => issnsOf(journal).includes(issn));
  const wanted = words(query);
  if (wanted.length === 0) return [];
  return journals
    .flatMap((journal) => {
      const rank = matchRank(words(journal.name), wanted);
      return rank === undefined ? [] : [{ journal, rank }];
    })
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        b.journal.articleCount - a.journal.articleCount ||
        a.journal.name.localeCompare(b.journal.name),
    )
    .map(({ journal }) => journal);
}

/**
 * Resolves the `journal` input of a search to one indexed journal. Unknown or ambiguous
 * names are `INVALID_INPUT` on `journal`, naming the candidates and their ISSNs so the
 * model can retry with one (ARCHITECTURE.md edge cases).
 */
export function resolveJournal(journals: readonly JournalSummary[], input: string): JournalSummary {
  const found = findJournals(journals, input);
  const [first, second] = found;
  if (first === undefined) {
    throw appError(
      'INVALID_INPUT',
      'No indexed journal matches the journal filter; call get_journal to look journals up, or leave the filter out',
      { field: 'journal' },
    );
  }
  if (second === undefined || words(first.name).join(' ') === words(input).join(' ')) return first;
  const names = found
    .slice(0, JOURNAL_MATCH_LIMIT)
    .map((journal) => `${journal.name} (${issnsOf(journal).join(', ')})`)
    .join('; ');
  throw appError(
    'INVALID_INPUT',
    `The journal filter matches several journals: ${names}. Pass one of their ISSNs instead`,
    { field: 'journal' },
  );
}

function words(text: string): string[] {
  return foldText(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '');
}

/**
 * The best place the query's words appear in a name, as a rank: 0 the whole name, 1 at its
 * start, 2 elsewhere as whole words, 3 elsewhere with the last word cut short; undefined
 * when they do not appear.
 */
function matchRank(name: readonly string[], wanted: readonly string[]): number | undefined {
  let best: number | undefined;
  for (let start = 0; start + wanted.length <= name.length; start += 1) {
    const fits = wanted.every((word, offset) => {
      const candidate = name[start + offset] ?? '';
      return offset === wanted.length - 1 ? candidate.startsWith(word) : candidate === word;
    });
    if (!fits) continue;
    const whole = name[start + wanted.length - 1] === wanted.at(-1);
    const rank = start === 0 ? (whole && name.length === wanted.length ? 0 : 1) : whole ? 2 : 3;
    best = Math.min(best ?? rank, rank);
  }
  return best;
}
