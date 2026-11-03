import { foldedWords, queryForms } from '@scholarly-mcp/lexical';

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

/** Builds the `MATCH` expression for the trigram table from its stems. */
export function trigramMatch(stems: readonly string[]): string | undefined {
  return stems.length === 0 ? undefined : stems.map(quote).join(' OR ');
}
