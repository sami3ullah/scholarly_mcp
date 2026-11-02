const GERMAN_FOLDS: Readonly<Record<string, string>> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/**
 * Lowercases a text and folds umlauts and ß to their two-letter spellings, then strips any
 * other diacritics, so "Ärzte" and "Aerzte", "Straße" and "Strasse" become the same word.
 * Applied the same way at index and at query time.
 */
export function foldText(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[äöüß]/g, (letter) => GERMAN_FOLDS[letter] ?? letter)
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}
