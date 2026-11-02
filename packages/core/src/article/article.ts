import { z } from 'zod';
import { authorSchema } from './author.js';
import { doiSchema } from './doi.js';
import { journalSchema } from './journal.js';
import { languageSchema } from './language.js';
import { licenseSchema } from './license.js';
import { publishedDateSchema } from './published-date.js';
import { subjectSchema } from './subject.js';

/**
 * The canonical article record every source emits and every store holds.
 * `abstract` is plain text with section labels kept; it is absent, never invented, when the
 * source has none.
 */
export const articleSchema = z.object({
  doi: doiSchema,
  title: z.string().min(1),
  subtitle: z.string().min(1).optional(),
  journal: journalSchema,
  authors: z.array(authorSchema),
  published: publishedDateSchema,
  language: languageSchema.optional(),
  abstract: z.string().min(1).optional(),
  subjects: z.array(subjectSchema),
  licenses: z.array(licenseSchema),
  isOpenAccess: z.boolean(),
  isRetracted: z.boolean(),
  landingUrl: z.url(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/, 'Expected a hex SHA-256 digest'),
  sourceUpdatedAt: z.date(),
  ingestedAt: z.date(),
});

export type Article = z.infer<typeof articleSchema>;
