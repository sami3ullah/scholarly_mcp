const WORD = /[\p{L}\p{N}]+/gu;

/** Splits a text into its words: runs of letters and digits, in their original spelling. */
export function queryWords(text: string): string[] {
  return Array.from(text.matchAll(WORD), ([word]) => word);
}
