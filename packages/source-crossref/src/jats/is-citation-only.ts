/** Starts like a reference list entry: "Franke H, …", "Griffiths GS, …", "Franke J-D, …". */
const AUTHOR_START = /^\p{Lu}[\p{L}'’-]+(?: \p{Lu}[\p{L}'’-]+)* \p{Lu}{1,3}(?:-\p{Lu})?\b/u;
/** Ends like one: "… 2022; 23 (4): 4–13", optionally followed by a DOI. */
const CITATION_END =
  /(?:19|20)\d{2}\s*[;,]\s*\d+\s*(?:\([^)]*\))?\s*:\s*[A-Za-z]?\d+(?:\s*[-–]\s*[A-Za-z]?\d+)?\.?(?:\s*doi:?\s*\S+)?$/i;
/** Real abstracts are longer; capping the length keeps a long abstract that cites safe. */
const MAX_CITATION_LENGTH = 400;

/**
 * Whether every paragraph is a bibliographic citation rather than prose. Thieme deposits
 * these for translated or summarised republications, where the "abstract" names the
 * original article.
 */
export function isCitationOnly(paragraphs: readonly string[]): boolean {
  return (
    paragraphs.length > 0 &&
    paragraphs.every(
      (text) =>
        text.length <= MAX_CITATION_LENGTH && AUTHOR_START.test(text) && CITATION_END.test(text),
    )
  );
}
