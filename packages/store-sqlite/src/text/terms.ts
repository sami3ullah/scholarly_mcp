import snowball from 'snowball-stemmers';
import { foldText } from './fold-text.js';

const german = snowball.newStemmer('german');
const english = snowball.newStemmer('english');

/** Splits a text into folded words: runs of letters and digits. */
export function foldedWords(text: string): string[] {
  return foldText(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '');
}

/**
 * Stems a folded word in the given language, or in both German and English when the language
 * is unknown or neither. FTS5 has no German stemmer, so stemming happens here (PLAN.md
 * "SQLite store"). Stemming folded words keeps "Ärzte" and "Aerzte" equal after stemming too.
 */
export function stemWord(word: string, language: string | undefined): string[] {
  if (language === 'de') return [german.stem(word)];
  if (language === 'en') return [english.stem(word)];
  return unique([german.stem(word), english.stem(word)]);
}

/** The stemmed words of a text in its language, space-joined for an FTS column. */
export function stemmedText(text: string, language: string | undefined): string {
  return foldedWords(text)
    .flatMap((word) => stemWord(word, language))
    .join(' ');
}

/**
 * The forms a query word may take in the index: the folded word and its German and English
 * stems, because the language of a query is never certain (PLAN.md "Query pipeline").
 */
export function queryForms(word: string): { folded: string; stems: string[] } {
  return { folded: word, stems: stemWord(word, undefined) };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
