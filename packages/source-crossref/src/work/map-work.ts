import {
  activeLicense,
  articleSchema,
  hashArticleContent,
  normalizeDoi,
  type Article,
  type ArticleContent,
  type Doi,
} from '@scholarly-mcp/core';
import { cleanJatsAbstract, cleanJatsInline } from '../jats/clean-jats.js';
import { classifyWork } from './classify-work.js';
import { mapAuthors, mapJournal } from './map-contributors.js';
import { mapIssueLocator } from './map-issue-locator.js';
import type { CrossrefWork } from './crossref-work.js';
import { isOpenLicense, mapLicenses } from './map-licenses.js';
import { mapPublishedDate } from './map-published-date.js';

/** Why a work was not emitted as an article; logged as counts per page. */
export type SkipReason = 'other-type' | 'notice' | 'invalid';

/** The result of mapping one Crossref work. */
export type MappedWork =
  | {
      readonly kind: 'article';
      readonly article: Article;
      readonly retracts: readonly Doi[];
    }
  | {
      readonly kind: 'skipped';
      readonly reason: SkipReason;
      readonly doi: string;
      readonly retracts: readonly Doi[];
      /** For `invalid`: the schema paths that failed, never field values. */
      readonly problems?: readonly string[];
    };

/** What the mapper needs besides the work. */
export interface MapWorkContext {
  /** The ingestion instant: it opens embargoed licences and stamps `ingestedAt`. */
  readonly now: Date;
  /** Marks the article retracted even if its own record does not say so yet. */
  readonly knownRetracted?: boolean;
  /** When the article's record effectively changed, if later than its deposit. */
  readonly updatedAt?: Date;
}

/**
 * Maps a Crossref work to a canonical article, or says why it was skipped. Only journal
 * articles are emitted; notices (errata, corrections, retraction notices) are skipped but
 * still report what they retract. Nothing is invented: a missing abstract stays missing and
 * a record that fails the canonical schema is skipped.
 */
export async function mapWork(work: CrossrefWork, context: MapWorkContext): Promise<MappedWork> {
  const title = cleanJatsInline(work.title?.[0] ?? '');
  const { kind, isRetracted, retracts } = classifyWork(work, title);
  if (kind !== 'article') return { kind: 'skipped', reason: kind, doi: work.DOI, retracts };

  const doi = normalizeDoi(work.DOI);
  const published = mapPublishedDate(work);
  if (doi === undefined || published === undefined) {
    const problems = [...(doi ? [] : ['doi']), ...(published ? [] : ['published'])];
    return { kind: 'skipped', reason: 'invalid', doi: work.DOI, retracts, problems };
  }
  const content = contentOf(work, {
    doi,
    title,
    published,
    isRetracted: isRetracted || context.knownRetracted === true,
    now: context.now,
  });
  const deposited = new Date(work.deposited['date-time']);
  const parsed = articleSchema.safeParse({
    ...content,
    contentHash: await hashArticleContent(content),
    sourceUpdatedAt:
      context.updatedAt !== undefined && context.updatedAt > deposited
        ? context.updatedAt
        : deposited,
    ingestedAt: context.now,
  });
  if (parsed.success) return { kind: 'article', article: parsed.data, retracts };
  const problems = parsed.error.issues.map((issue) => issue.path.map(String).join('.'));
  return { kind: 'skipped', reason: 'invalid', doi: work.DOI, retracts, problems };
}

interface Known {
  readonly doi: Doi;
  readonly title: string;
  readonly published: ArticleContent['published'];
  readonly isRetracted: boolean;
  readonly now: Date;
}

function contentOf(work: CrossrefWork, known: Known): ArticleContent {
  const subtitle = cleanJatsInline(work.subtitle?.[0] ?? '');
  const language = work.language?.toLowerCase().split('-')[0];
  const abstract = work.abstract === undefined ? undefined : cleanJatsAbstract(work.abstract);
  const licenses = mapLicenses(work);
  const license = activeLicense(licenses, known.now);
  return {
    doi: known.doi,
    title: known.title,
    ...(subtitle && { subtitle }),
    journal: mapJournal(work),
    authors: mapAuthors(work),
    published: known.published,
    ...mapIssueLocator(work),
    ...(language && /^[a-z]{2}$/.test(language) && { language }),
    ...(abstract && { abstract }),
    subjects: [],
    licenses,
    isOpenAccess: license !== undefined && isOpenLicense(license),
    isRetracted: known.isRetracted,
    landingUrl: landingUrl(work, known.doi),
  };
}

/** The publisher's page from the deposit, or the DOI resolver when it is missing or unusable. */
function landingUrl(work: CrossrefWork, doi: Doi): string {
  const deposited = work.resource?.primary.URL.trim() ?? '';
  return /^https?:\/\//i.test(deposited) && URL.canParse(deposited)
    ? deposited
    : `https://doi.org/${doi}`;
}
