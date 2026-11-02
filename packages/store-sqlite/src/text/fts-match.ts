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
 * The stems the trigram table looks for: each word's stems long enough to search as
 * substrings, so "Vorhofflimmern" finds "Vorhofflimmertherapie".
 */
export function trigramStems(terms: readonly string[], language: string | undefined): string[] {
  const stems = terms
    .flatMap(foldedWords)
    .flatMap((word) => queryForms(word, language).stems)
    .filter((stem) => stem.length >= MIN_TRIGRAM_LENGTH);
  return [...new Set(stems)];
}

/** Builds the `MATCH` expression for the trigram table from its stems. */
export function trigramMatch(stems: readonly string[]): string | undefined {
  return stems.length === 0 ? undefined : stems.map(quote).join(' OR ');
}

/** The shortest first part of a compound; shorter ones are prefixes, like "de" or "re". */
const MIN_HEAD = 4;
/** How many letters may follow the stem of a compound's last part (its ending). */
const MAX_ENDING = 3;

/**
 * Whether a word of the text holds one of the stems as the first or last part of a
 * compound: at its start ("Vorhofflimmertherapie"), or after a head of 4 or more letters
 * with at most a short ending ("Darmkrebs", "Darmkrebses"). A stem after a short prefix or
 * deep inside a word is a different word: "fibrill" in "Defibrillation".
 */
export function hasStemAtWordEdge(text: string, stems: readonly string[]): boolean {
  return foldedWords(text).some((word) =>
    stems.some((stem) => {
      if (word.startsWith(stem)) return true;
      const at = word.indexOf(stem, MIN_HEAD);
      return at !== -1 && word.length - at - stem.length <= MAX_ENDING;
    }),
  );
}
