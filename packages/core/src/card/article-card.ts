import { z } from 'zod';
import { doiSchema } from '../article/doi.js';

/** The longest teaser a card may carry (key design decision 11). */
export const TEASER_MAX_LENGTH = 280;

/**
 * What every tool returns per article: enough to pick and explain it, never the article
 * itself. The url is the landing link with token and UTM tags.
 */
export const articleCardSchema = z.object({
  doi: doiSchema,
  title: z.string().min(1),
  journal: z.string().min(1),
  year: z.int(),
  firstAuthor: z.string().min(1).optional(),
  teaser: z.string().max(TEASER_MAX_LENGTH),
  whyMatched: z.string().max(120),
  access: z.enum(['open', 'subscription', 'unknown']),
  url: z.url(),
});

export type ArticleCard = z.infer<typeof articleCardSchema>;
