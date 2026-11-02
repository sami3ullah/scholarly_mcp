import { foldText, type Chunk } from '@scholarly-mcp/core';
import { queryWords } from '../query/query-words.js';
import { cutAtWord } from './cut-at-word.js';

/** The card schema's limit for `whyMatched`. */
export const WHY_MATCHED_MAX_LENGTH = 120;
/** Words this long or longer may match by a shared prefix, like a stem. */
const MIN_PREFIX = 4;
/** How many letters of the shorter word's ending may differ (inflections, compound tails). */
const MAX_ENDING = 3;

/** What a match is explained from. Only labels and the query's own terms are shown, never text. */
export interface MatchContext {
  /** The article's best chunk; undefined when the article was found by its DOI. */
  readonly chunk: Pick<Chunk, 'text' | 'section' | 'origin'> | undefined;
  readonly title: string;
  /** Lexical terms in query order: the query's words, then abbreviation expansions. */
  readonly terms: readonly string[];
}

/**
 * Labels why an article matched, such as "Matched in Results: rivaroxaban, dosing", from
 * the best chunk's section and the query terms found in it or in the title; "Related in
 * meaning (Results)" when it was found by meaning alone. Fits the card's 120 characters.
 */
export function whyMatched({ chunk, title, terms }: MatchContext): string {
  if (chunk === undefined) return 'Matched by DOI';
  const place = placeOf(chunk);
  const inText = termsFoundIn(chunk.text, terms);
  if (inText.length > 0) return withTerms(`Matched in ${place}`, inText);
  const inTitle = termsFoundIn(title, terms);
  if (inTitle.length > 0) return withTerms('Matched in title', inTitle);
  return cutAtWord(`Related in meaning (${place})`, WHY_MATCHED_MAX_LENGTH);
}

function placeOf({ section, origin }: NonNullable<MatchContext['chunk']>): string {
  if (origin === 'metadata') return 'title';
  if (origin === 'fulltext') return section === undefined ? 'full text' : `${section} (full text)`;
  return section ?? 'abstract';
}

function withTerms(lead: string, terms: readonly string[]): string {
  let label = `${lead}: ${terms[0] ?? ''}`;
  for (const term of terms.slice(1)) {
    const next = `${label}, ${term}`;
    if (next.length > WHY_MATCHED_MAX_LENGTH) break;
    label = next;
  }
  return cutAtWord(label, WHY_MATCHED_MAX_LENGTH);
}

/** The terms all of whose words occur in the text, as typed. */
function termsFoundIn(text: string, terms: readonly string[]): string[] {
  const words = queryWords(foldText(text));
  return terms.filter((term) =>
    queryWords(foldText(term)).every((wanted) => words.some((word) => sameWord(wanted, word))),
  );
}

/** Equal, or sharing a prefix that leaves at most a short ending: "patient" and "patients". */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < MIN_PREFIX || b.length < MIN_PREFIX) return false;
  let prefix = 0;
  while (prefix < a.length && a[prefix] === b[prefix]) prefix += 1;
  return prefix >= Math.max(MIN_PREFIX, Math.min(a.length, b.length) - MAX_ENDING);
}
