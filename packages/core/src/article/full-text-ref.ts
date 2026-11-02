import { z } from 'zod';

/**
 * Points at an article's open access full text, indexed for matching only (ADR 0003). It
 * holds no text: only where the text came from, under which licence, and a revision that
 * changes when the source's copy changes, so a rebuild can reuse full-text chunks whose
 * reference is unchanged without fetching the text again.
 */
export const fullTextRefSchema = z.object({
  source: z.literal('europepmc'),
  /** The source's id for the text, e.g. a PMCID. */
  id: z.string().min(1),
  /** The version-of-record licence the text is used under; it is on the allowlist. */
  licenseUrl: z.url(),
  revision: z.string().min(1),
});

export type FullTextRef = z.infer<typeof fullTextRefSchema>;
