import { z } from 'zod';
import { accessStatusSchema } from '../access/access-status.js';
import { canonicalDoiSchema } from '../article/doi.js';
import { publishedDateSchema } from '../article/published-date.js';
import { TEASER_MAX_LENGTH, articleCardSchema } from '../card/article-card.js';

/** Authors listed by name on the chosen article; `authorCount` tells how many there are. */
export const LANDING_AUTHOR_LIMIT = 10;

/** Topic labels the page is headed with. */
export const LANDING_TOPIC_LIMIT = 3;

/** Related articles shown under the matches. */
export const LANDING_RELATED_LIMIT = 3;

/** What the match list and related reading show per article: metadata and the teaser. */
export const landingArticleSummarySchema = z.object({
  doi: canonicalDoiSchema,
  title: z.string().min(1),
  journal: z.string().min(1),
  year: z.int(),
  firstAuthor: z.string().min(1).optional(),
  teaser: z.string().max(TEASER_MAX_LENGTH),
  access: articleCardSchema.shape.access,
  retracted: z.boolean(),
});

export type LandingArticleSummary = z.infer<typeof landingArticleSummarySchema>;

/**
 * The chosen article. The abstract is shown in full on the landing page, which is the
 * publisher's site; full text never is (ADR 0003).
 */
export const landingArticleSchema = landingArticleSummarySchema.extend({
  subtitle: z.string().min(1).optional(),
  authors: z.array(z.string().min(1)).max(LANDING_AUTHOR_LIMIT),
  authorCount: z.int().nonnegative(),
  published: publishedDateSchema,
  language: z.string().min(2).optional(),
  abstract: z.string().min(1).optional(),
  subjects: z.array(z.string().min(1)),
  /** The version-of-record licence URL in force, or `unknown`. */
  license: articleCardSchema.shape.license,
  /** The article's page on the publisher's site, also the canonical URL. */
  articleUrl: z.url(),
  doiUrl: z.url(),
});

export type LandingArticle = z.infer<typeof landingArticleSchema>;

/**
 * Where the search matched the chosen article. Only abstract text is quoted: a title match
 * needs no quote, and full text is never shown, so it names the section alone (ADR 0003).
 */
export const matchedPassageSchema = z.discriminatedUnion('in', [
  z.object({
    in: z.literal('abstract'),
    text: z.string().min(1),
    section: z.string().min(1).optional(),
  }),
  z.object({ in: z.literal('title') }),
  z.object({ in: z.literal('fullText'), section: z.string().min(1).optional() }),
]);

export type MatchedPassage = z.infer<typeof matchedPassageSchema>;

/** What a reader can do to read the chosen article. */
export const landingAccessSchema = z.object({
  status: accessStatusSchema,
  loginUrl: z.url().optional(),
  purchaseUrl: z.url().optional(),
});

export type LandingAccess = z.infer<typeof landingAccessSchema>;

/**
 * Everything a landing page shows, as the landing API returns it (ADR 0032). `session` says
 * whether the link's results could be rebuilt: `active`, `unavailable` (expired or unknown
 * token, so the page falls back to the article by its DOI) or `none` (no token in the link).
 * It holds no query text: `topics` names the search from the matched articles' subjects.
 */
export const landingPageSchema = z.object({
  session: z.enum(['active', 'unavailable', 'none']),
  /** The interface language: the search's language, else the chosen article's. */
  language: z.enum(['de', 'en']),
  topics: z.array(z.string().min(1)).max(LANDING_TOPIC_LIMIT),
  chosen: landingArticleSchema,
  access: landingAccessSchema,
  matchedPassage: matchedPassageSchema.optional(),
  /** The search's other results in their original order. */
  matches: z.array(landingArticleSummarySchema).max(9),
  related: z.array(landingArticleSummarySchema).max(LANDING_RELATED_LIMIT),
});

export type LandingPage = z.infer<typeof landingPageSchema>;
