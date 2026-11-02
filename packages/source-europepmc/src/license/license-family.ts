/** A Creative Commons licence without its version, e.g. `by` or `by-nc-nd`; `zero` for CC0. */
export type LicenseFamily = string;

const CC_URL = /creativecommons\.org\/(?:licenses\/([a-z-]+)|publicdomain\/(zero))\b/i;

/** The family of a Creative Commons licence URL, or undefined for any other licence. */
export function licenseFamily(url: string): LicenseFamily | undefined {
  const match = CC_URL.exec(url);
  return (match?.[1] ?? match?.[2])?.toLowerCase();
}

/**
 * The family of Europe PMC's licence field, which names no version: `cc by`, `cc by-nc-nd`,
 * `cc0`. Undefined for anything else, which then matches no licence.
 */
export function europepmcLicenseFamily(value: string | undefined): LicenseFamily | undefined {
  const match = /^cc[\s-]*(by(?:-[a-z]{2})*|0)$/i.exec(value?.trim() ?? '');
  if (match?.[1] === undefined) return undefined;
  return match[1] === '0' ? 'zero' : match[1].toLowerCase();
}

/** Compares licence URLs ignoring scheme, case and a trailing slash. */
export function sameLicenseUrl(a: string, b: string): boolean {
  const canonical = (url: string) =>
    url
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '');
  return canonical(a) === canonical(b);
}
