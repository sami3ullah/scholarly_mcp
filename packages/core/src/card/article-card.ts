import { z } from 'zod';
import { canonicalDoiSchema } from '../article/doi.js';

/** The longest teaser a card may carry (key design decision 11). */
export const TEASER_MAX_LENGTH = 280;

/** The card's licence when no version-of-record licence is in force or known. */
export const UNKNOWN_LICENSE = 'unknown';

/**
 * What every tool returns per article: enough to pick and explain it, never the article
 * itself. The url is the landing link with token and UTM tags. DOI, link and licence are
 * required, so every result carries its attribution (ARCHITECTURE.md "The article card"). It has no
 * transforms, so tools can publish it as JSON Schema.
 */
export const articleCardSchema = z.object({
  doi: canonicalDoiSchema,
  title: z.string().min(1),
  journal: z.string().min(1),
  year: z.int(),
  firstAuthor: z.string().min(1).optional(),
  teaser: z.string().max(TEASER_MAX_LENGTH),
  whyMatched: z.string().max(120),
  access: z.enum(['open', 'subscription', 'unknown']),
  /** The version-of-record licence URL in force, or `unknown`. */
  license: z.union([z.url(), z.literal(UNKNOWN_LICENSE)]),
  url: z.url(),
});

export type ArticleCard = z.infer<typeof articleCardSchema>;
