import { foldedWords, queryForms } from './terms.js';

/** Words shorter than this would match too much as substrings. */
const MIN_TRIGRAM_LENGTH = 4;

/**
 * The stems a substring (trigram) search looks for: each word's stems long enough to search
 * as substrings, so "Vorhofflimmern" finds "Vorhofflimmertherapie".
 */
export function trigramStems(terms: readonly string[], language: string | undefined): string[] {
  const stems = terms
    .flatMap(foldedWords)
    .flatMap((word) => queryForms(word, language).stems)
    .filter((stem) => stem.length >= MIN_TRIGRAM_LENGTH);
  return [...new Set(stems)];
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
