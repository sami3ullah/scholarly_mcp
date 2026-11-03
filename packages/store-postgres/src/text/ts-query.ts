import { foldedWords, queryForms } from '@scholarly-mcp/lexical';

/** Postgres refuses longer lexemes; such a word could not be in the index anyway. */
const MAX_LEXEME_BYTES = 2047;

const lexeme = (word: string) => `'${word.replaceAll("'", "''")}'`;

/** One distinct query word: its `to_tsquery('simple', …)` text and the lexemes it matches. */
export interface QueryWord {
  readonly query: string;
  readonly lexemes: readonly string[];
}

/**
 * Builds one query per distinct query word, or none when no word is left; the lexical search
 * weighs each by how rare it is and matches any (OR). Raw input never reaches it: every word
 * is reduced to letters and digits and quoted, so `&`, `!`, `:*` or quotes are plain words
 * (PLAN.md edge cases). A word matches its stems in the title (A) or stemmed text (B), its
 * folded form in the folded text (C), as the SQLite `MATCH` does per column. Stems are in
 * `language`, or in German and English when it is undefined.
 */
export function queryWords(terms: readonly string[], language: string | undefined): QueryWord[] {
  const words = new Set(
    terms.flatMap(foldedWords).filter((word) => Buffer.byteLength(word) <= MAX_LEXEME_BYTES),
  );
  return [...words].map((word) => {
    const { folded, stems } = queryForms(word, language);
    const forms = [...stems.map((stem) => `${lexeme(stem)}:AB`), `${lexeme(folded)}:C`];
    return { query: `(${forms.join(' | ')})`, lexemes: [...new Set([...stems, folded])] };
  });
}

/**
 * A word in more than this share of chunks is too common to pick candidates by: it still
 * adds to their score, but only the rarer words decide which chunks are ranked. Ranking every
 * chunk that holds "patients" cost over a second on the 176k-chunk corpus; on the golden set
 * matching only words under 5 % (or 2 %) changed no score.
 */
export const COMMON_WORD_SHARE = 0.05;

/** A query word with its inverse document frequency, and whether it picks candidates. */
export interface WeightedWord {
  readonly query: string;
  readonly idf: number;
  readonly matches: boolean;
}

/**
 * Weighs query words as BM25 does, by `ln(1 + (N - n + 0.5) / (n + 0.5))` for a word in `n`
 * of `N` chunks; a word's `n` is that of its most frequent lexeme. Only words under
 * `COMMON_WORD_SHARE` pick candidates, unless every word is that common.
 */
export function weighWords(
  words: readonly QueryWord[],
  chunksWith: ReadonlyMap<string, number>,
  totalChunks: number,
): WeightedWord[] {
  const counts = words.map(({ lexemes }) =>
    Math.max(0, ...lexemes.map((word) => chunksWith.get(word) ?? 0)),
  );
  const total = Math.max(totalChunks, ...counts, 1);
  const rare = counts.map((n) => n <= COMMON_WORD_SHARE * total);
  const anyRare = rare.some(Boolean);
  return words.map(({ query }, i) => {
    const n = counts[i] ?? 0;
    return {
      query,
      idf: Math.log(1 + (total - n + 0.5) / (n + 0.5)),
      matches: !anyRare || rare[i] === true,
    };
  });
}

/** `LIKE` patterns for the trigram top-up: each stem anywhere in the folded text. */
export function containsPatterns(stems: readonly string[]): string[] {
  return stems.map((stem) => `%${stem.replaceAll(/[\\%_]/g, (c) => `\\${c}`)}%`);
}
