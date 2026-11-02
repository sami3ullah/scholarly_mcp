import { normalizeDoi, type Doi } from '@scholarly-mcp/core';
import type { CrossrefWork } from './crossref-work.js';

/** Update types that withdraw an article from the record. */
const RETRACTING = new Set(['retraction', 'withdrawal', 'removal']);
/** Update types whose record is a notice about another article rather than an article. */
const NOTICE = new Set([
  ...RETRACTING,
  'addendum',
  'clarification',
  'correction',
  'corrigendum',
  'erratum',
  'expression_of_concern',
  'partial_retraction',
]);
/** Notice titles, for deposits without update relations ("Erratum: Pflanzen der Alpenwiesen"). */
const NOTICE_TITLE = [
  /^(?:erratum|errata|corrigendum|korrigendum|berichtigung)\b/i,
  /^(?:correction|retraction|korrektur|withdrawal|expression of concern)(?:\s+(?:note|notice))?(?:\s+(?:to|of|zu))?\s*(?::|$|["“„«])/i,
];
/** Titles a publisher gives an article it has retracted ("Retracted Article: …"). */
const RETRACTED_TITLE = /^(?:retracted(?:\s+article)?|zurückgezogen)\s*:/i;

/** What a Crossref work is, as far as discovery cares. */
export interface WorkClassification {
  /** `notice` covers errata, corrections and retraction notices; none are indexed. */
  readonly kind: 'article' | 'notice' | 'other-type';
  readonly isRetracted: boolean;
  /** Other articles this record retracts; their own records must be marked retracted. */
  readonly retracts: readonly Doi[];
}

/**
 * Classifies a work by its Crossref update relations and, for deposits that lack them, its
 * title. An article is retracted when another record retracts it (`updated-by`), when
 * Retraction Watch annotates the article itself (`update-to` pointing at its own DOI), or
 * when the publisher has retitled it as retracted.
 */
export function classifyWork(work: CrossrefWork, title: string): WorkClassification {
  const own = normalizeDoi(work.DOI);
  const updatesOthers = (work['update-to'] ?? []).filter(
    (update) => normalizeDoi(update.DOI) !== own,
  );
  const updatesSelf = (work['update-to'] ?? []).filter(
    (update) => normalizeDoi(update.DOI) === own,
  );
  const retracts = updatesOthers
    .filter((update) => RETRACTING.has(update.type))
    .flatMap((update) => normalizeDoi(update.DOI) ?? []);
  const isNotice =
    updatesOthers.some((update) => NOTICE.has(update.type)) ||
    NOTICE_TITLE.some((pattern) => pattern.test(title));
  const isRetracted =
    [...(work['updated-by'] ?? []), ...updatesSelf].some((update) => RETRACTING.has(update.type)) ||
    RETRACTED_TITLE.test(title);
  const kind = work.type !== 'journal-article' ? 'other-type' : isNotice ? 'notice' : 'article';
  return { kind, isRetracted, retracts: [...new Set(retracts)] };
}
