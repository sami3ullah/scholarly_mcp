import { foldedWords, queryForms } from './terms.js';

/** Words shorter than this would match too much as substrings. */
const MIN_TRIGRAM_LENGTH = 4;

const quote = (word: string) => `"${word.replaceAll('"', '""')}"`;

/**
 * Builds the FTS5 `MATCH` expression for the main table from query terms, or undefined when
 * no word is left. Raw input never reaches `MATCH`: every word is reduced to letters and
 * digits and quoted, so `AND`, `NEAR(`, `*` or quotes are plain words (PLAN.md edge cases).
 * Any word may match, in its folded or stemmed form; BM25 ranks chunks with more words first.
 * Stems are in `language`, or in German and English when it is undefined.
 */
export function mainMatch(
  terms: readonly string[],
  language: string | undefined,
): string | undefined {
  const words = terms.flatMap(foldedWords);
  if (words.length === 0) return undefined;
  return words
    .map((word) => {
      const { folded, stems } = queryForms(word, language);
      const stemmed = stems.map(quote).join(' OR ');
      return `({text_stemmed title_stemmed} : (${stemmed}) OR text_folded : ${quote(folded)})`;
    })
    .join(' OR ');
}

/**
 * Builds the `MATCH` expression for the trigram table: each word's stems as substrings, so
 * "Vorhofflimmern" finds "Vorhofflimmertherapie". Undefined when every word is too short.
 */
export function trigramMatch(
  terms: readonly string[],
  language: string | undefined,
): string | undefined {
  const stems = terms
    .flatMap(foldedWords)
    .flatMap((word) => queryForms(word, language).stems)
    .filter((stem) => stem.length >= MIN_TRIGRAM_LENGTH);
  return stems.length === 0 ? undefined : [...new Set(stems)].map(quote).join(' OR ');
}
