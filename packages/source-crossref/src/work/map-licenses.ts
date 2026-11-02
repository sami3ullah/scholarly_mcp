import type { License } from '@scholarly-mcp/core';
import type { CrossrefWork } from './crossref-work.js';

const CONTENT_VERSIONS = new Set<License['contentVersion']>(['vor', 'am', 'tdm', 'unspecified']);

/**
 * Maps Crossref licence entries. Creative Commons URLs are deposited in several spellings
 * (`http`, missing trailing slash), so they are canonicalised to the form the full-text
 * allowlist uses. Entries without a usable URL are dropped, which leaves the record closed.
 */
export function mapLicenses(work: CrossrefWork): License[] {
  return (work.license ?? []).flatMap((entry) => {
    const url = canonicalLicenseUrl(entry.URL);
    if (url === undefined) return [];
    const version = entry['content-version'] as License['contentVersion'];
    const contentVersion = CONTENT_VERSIONS.has(version) ? version : 'unspecified';
    return [{ url, contentVersion, start: new Date(entry.start['date-time']) }];
  });
}

/** Whether a licence lets anyone read the article, i.e. it is a Creative Commons licence. */
export function isOpenLicense(license: License): boolean {
  return new URL(license.url).hostname === 'creativecommons.org';
}

function canonicalLicenseUrl(raw: string): string | undefined {
  if (!URL.canParse(raw.trim())) return undefined;
  const url = new URL(raw.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  if (url.hostname.replace(/^www\./, '') !== 'creativecommons.org') return url.href;
  const path = url.pathname.toLowerCase().replace(/\/?$/, '/');
  return `https://creativecommons.org${path}`;
}
