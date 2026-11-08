import {
  activeLicense,
  normalizeDoi,
  normalizeText,
  subjectSchema,
  type Article,
  type Doi,
  type Enrichment,
  type FullTextRef,
  type Subject,
} from '@scholarly-mcp/core';
import { DomUtils, parseDocument } from 'htmlparser2';
import {
  europepmcLicenseFamily,
  licenseFamily,
  sameLicenseUrl,
} from '../license/license-family.js';
import type { SearchHit } from './search-hit.js';

/**
 * MeSH check tags: descriptors NLM adds to almost every record (species, sex, age groups).
 * They say nothing about an article's topic, so they are not subjects.
 */
const CHECK_TAGS = new Set(
  [
    'Humans',
    'Animals',
    'Male',
    'Female',
    'Pregnancy',
    'Infant',
    'Infant, Newborn',
    'Child',
    'Child, Preschool',
    'Adolescent',
    'Young Adult',
    'Adult',
    'Middle Aged',
    'Aged',
    'Aged, 80 and over',
    'Mice',
    'Rats',
  ].map((tag) => tag.toLowerCase()),
);

/** At most this many author keywords are kept per article. */
const MAX_KEYWORDS = 20;

/**
 * Picks one hit per requested DOI. A hit counts only when it states that DOI itself: Europe
 * PMC can return a record that matched the query but carries no DOI, and matching is on DOI
 * only (ARCHITECTURE.md edge cases). Preprints are ignored; a hit with a PMCID beats one without.
 */
export function chooseHits(
  hits: readonly SearchHit[],
  wanted: ReadonlySet<Doi>,
): Map<Doi, SearchHit> {
  const chosen = new Map<Doi, SearchHit>();
  for (const hit of hits) {
    const doi = hit.doi === undefined ? undefined : normalizeDoi(hit.doi);
    if (doi === undefined || !wanted.has(doi) || hit.source === 'PPR') continue;
    const current = chosen.get(doi);
    if (current === undefined || (current.pmcid === undefined && hit.pmcid !== undefined)) {
      chosen.set(doi, hit);
    }
  }
  return chosen;
}

/** What a hit adds to the article it matched (ADR 0003, ADR 0004). */
export function toEnrichment(
  hit: SearchHit,
  article: Article,
  allowlist: readonly string[],
  now: Date,
): Enrichment {
  const fullText = fullTextRefOf(hit, article, allowlist, now);
  return { subjects: subjectsOf(hit), ...(fullText !== undefined && { fullText }) };
}

/**
 * MeSH descriptor names (without check tags) and author keywords, as short plain labels
 * with their origin. Qualifiers are dropped; MeSH is used as labels only, unaltered.
 */
export function subjectsOf(hit: SearchHit): Subject[] {
  const mesh = (hit.meshHeadingList?.meshHeading ?? [])
    .map(({ descriptorName }) => plainLabel(descriptorName))
    .filter((label) => !CHECK_TAGS.has(label.toLowerCase()))
    .map((label) => ({ label, origin: 'mesh' as const }));
  const keywords = (hit.keywordList?.keyword ?? [])
    .map((keyword) => ({ label: plainLabel(keyword), origin: 'keyword' as const }))
    .slice(0, MAX_KEYWORDS);
  const seen = new Set<string>();
  return [...mesh, ...keywords].filter((subject) => {
    const key = `${subject.origin}:${subject.label.toLowerCase()}`;
    if (!subjectSchema.safeParse(subject).success || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * A full-text reference when every condition of ADR 0003 holds: the article's version-of-
 * record licence is in force and on the allowlist, the article is not retracted, Europe PMC
 * holds it open access with full text under its PMCID, the copy is not an author manuscript,
 * and Europe PMC's licence is of the same family as Crossref's. Otherwise none, and the
 * article is indexed from its metadata only.
 */
export function fullTextRefOf(
  hit: SearchHit,
  article: Article,
  allowlist: readonly string[],
  now: Date,
): FullTextRef | undefined {
  const license = activeLicense(article.licenses, now);
  if (license === undefined || !allowlist.some((url) => sameLicenseUrl(url, license.url))) {
    return undefined;
  }
  if (article.isRetracted || hit.isOpenAccess !== 'Y' || hit.inEPMC !== 'Y') return undefined;
  if ([hit.authMan, hit.epmcAuthMan, hit.nihAuthMan].includes('Y')) return undefined;
  const { pmcid } = hit;
  if (pmcid === undefined || hit.fullTextIdList?.fullTextId.includes(pmcid) !== true) {
    return undefined;
  }
  const family = licenseFamily(license.url);
  if (family === undefined || europepmcLicenseFamily(hit.license) !== family) return undefined;
  const revision = hit.fullTextReceivedDate ?? hit.dateOfRevision;
  if (revision === undefined) return undefined;
  return { source: 'europepmc', id: pmcid, licenseUrl: license.url, revision };
}

/** A label as plain text: markup removed, entities decoded, whitespace collapsed. */
function plainLabel(value: string): string {
  const text = DomUtils.textContent(parseDocument(value).children);
  return normalizeText(text).replace(/\s+/g, ' ').trim();
}
