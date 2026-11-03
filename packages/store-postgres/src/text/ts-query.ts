import { foldedWords, queryForms } from '@scholarly-mcp/lexical';

/** Postgres refuses longer lexemes; such a word could not be in the index anyway. */
const MAX_LEXEME_BYTES = 2047;

const lexeme = (word: string) => `'${word.replaceAll("'", "''")}'`;

/**
 * Builds the `to_tsquery('simple', …)` text from query terms, or undefined when no word is
 * left. Raw input never reaches it: every word is reduced to letters and digits and quoted,
 * so `&`, `!`, `:*` or quotes are plain words (PLAN.md edge cases). Any word may match, its
 * stems in the title (A) or stemmed text (B), its folded form in the folded text (C), as
 * the SQLite `MATCH` does per column. Stems are in `language`, or in German and English
 * when it is undefined.
 */
export function tsQueryText(
  terms: readonly string[],
  language: string | undefined,
): string | undefined {
  const words = terms
    .flatMap(foldedWords)
    .filter((word) => Buffer.byteLength(word) <= MAX_LEXEME_BYTES);
  if (words.length === 0) return undefined;
  return words
    .map((word) => {
      const { folded, stems } = queryForms(word, language);
      const forms = [...stems.map((stem) => `${lexeme(stem)}:AB`), `${lexeme(folded)}:C`];
      return `(${forms.join(' | ')})`;
    })
    .join(' | ');
}

/** `LIKE` patterns for the trigram top-up: each stem anywhere in the folded text. */
export function containsPatterns(stems: readonly string[]): string[] {
  return stems.map((stem) => `%${stem.replaceAll(/[\\%_]/g, (c) => `\\${c}`)}%`);
}
