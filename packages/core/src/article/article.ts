import { z } from 'zod';
import { authorSchema } from './author.js';
import { doiSchema } from './doi.js';
import { fullTextRefSchema } from './full-text-ref.js';
import { journalSchema } from './journal.js';
import { languageSchema } from './language.js';
import { licenseSchema } from './license.js';
import { publishedDateSchema } from './published-date.js';
import { subjectSchema } from './subject.js';

/**
 * The canonical article record every source emits and every store holds.
 * `abstract` is plain text with section labels kept; it is absent, never invented, when the
 * source has none. `subjects` and `fullText` come from an enricher such as Europe PMC.
 * `volume`, `issue` and `pages` are kept as the publisher deposited them (`S 01`, `e12-e20`),
 * for citations only.
 */
export const articleSchema = z.object({
  doi: doiSchema,
  title: z.string().min(1),
  subtitle: z.string().min(1).optional(),
  journal: journalSchema,
  authors: z.array(authorSchema),
  published: publishedDateSchema,
  volume: z.string().min(1).optional(),
  issue: z.string().min(1).optional(),
  pages: z.string().min(1).optional(),
  language: languageSchema.optional(),
  abstract: z.string().min(1).optional(),
  subjects: z.array(subjectSchema),
  licenses: z.array(licenseSchema),
  isOpenAccess: z.boolean(),
  isRetracted: z.boolean(),
  /** Open access full text indexed for matching only; never shown (ADR 0003). */
  fullText: fullTextRefSchema.optional(),
  landingUrl: z.url(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/, 'Expected a hex SHA-256 digest'),
  sourceUpdatedAt: z.date(),
  ingestedAt: z.date(),
});

export type Article = z.infer<typeof articleSchema>;
