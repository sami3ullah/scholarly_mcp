const ELLIPSIS = '…';
const TRAILING = /[\s,;:.!?([{-]+$/u;

/**
 * Shortens a text to at most `max` characters, ellipsis included, cutting at the last word
 * boundary; a single word longer than half the space is cut mid-word instead. Never splits
 * a surrogate pair.
 */
export function cutAtWord(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  let cut = trimmed.slice(0, max - ELLIPSIS.length);
  const space = cut.search(/\s\S*$/u);
  if (space > max / 2) cut = cut.slice(0, space);
  else if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
  return `${cut.replace(TRAILING, '')}${ELLIPSIS}`;
}
