/** Soft hyphen, zero-width space/joiners, word joiner and byte-order mark. */
const INVISIBLE = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;
/** C0 and C1 control characters except tab and newline, which carry layout. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

/**
 * Normalises text before it is stored, chunked or searched: Unicode NFC, then strips soft
 * hyphens, zero-width characters and control characters. Without this, an NFD "ü" or a soft
 * hyphen inside a German compound would stop a query from matching.
 */
export function normalizeText(text: string): string {
  return text.normalize('NFC').replace(INVISIBLE, '').replace(CONTROL, '');
}
