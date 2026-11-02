import {
  detectLanguage,
  foldText,
  normalizeDoi,
  type Doi,
  type Language,
} from '@scholarly-mcp/core';
import { expandAbbreviations } from './abbreviations.js';
import { queryWords } from './query-words.js';
import { isStopword } from './stopwords.js';

/** How a normalised query is searched. */
export type QueryPlan =
  | { readonly kind: 'doi'; readonly doi: Doi }
  | {
      readonly kind: 'text';
      /** The words that carry meaning, as typed; used to explain matches. */
      readonly words: readonly string[];
      /** Lexical terms: the meaningful words plus abbreviation expansions. Empty means vector only. */
      readonly terms: readonly string[];
      /** What is embedded: the query, with abbreviation expansions appended. */
      readonly embeddingText: string;
      /** Set only when the query language is clear; otherwise both languages are stemmed. */
      readonly language?: Language;
    };

const DOI_IN_TEXT = /\b10\.\d{4,9}\/[^\s"'<>]+/i;
const TRAILING_PUNCTUATION = /[.,;:!?\]}"]+$/;
/** One letter or digit matches too much to help lexical search. */
const MIN_TERM_LENGTH = 2;

/**
 * Decides how to search a normalised query. A DOI anywhere in it goes straight to a lookup.
 * Otherwise stopwords and single characters are left out of the lexical terms, so a query
 * of only stopwords ("die der das") is searched by meaning alone (PLAN.md edge cases), and
 * known abbreviations are expanded on both sides.
 */
export function planQuery(query: string): QueryPlan {
  const doi = findDoi(query);
  if (doi !== undefined) return { kind: 'doi', doi };

  const words = unique(
    queryWords(query).filter((word) => word.length >= MIN_TERM_LENGTH && !isStopword(word)),
  );
  const expansions = expandAbbreviations(words);
  const language = detectLanguage(query);
  return {
    kind: 'text',
    words,
    terms: unique([...words, ...expansions]),
    embeddingText: expansions.length === 0 ? query : `${query} (${expansions.join(', ')})`,
    ...(language !== undefined && { language }),
  };
}

function findDoi(query: string): Doi | undefined {
  const match = DOI_IN_TEXT.exec(query)?.[0];
  return match === undefined ? undefined : normalizeDoi(trimTrailing(match));
}

/**
 * Removes sentence punctuation after a DOI, and closing brackets only when unbalanced:
 * "(see 10.1055/a-1)" loses its ")", but "10.1016/s0140-6736(20)30183-5" keeps its own.
 */
function trimTrailing(candidate: string): string {
  let doi = candidate.replace(TRAILING_PUNCTUATION, '');
  while (doi.endsWith(')') && count(doi, ')') > count(doi, '(')) {
    doi = doi.slice(0, -1).replace(TRAILING_PUNCTUATION, '');
  }
  return doi;
}

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}

/** Drops repeated words, comparing folded spellings. */
function unique(words: readonly string[]): string[] {
  const seen = new Set<string>();
  return words.filter((word) => {
    const key = foldText(word);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
