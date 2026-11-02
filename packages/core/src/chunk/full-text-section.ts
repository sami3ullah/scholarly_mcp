import { z } from 'zod';

/**
 * The only labels a full-text section may carry. A section heading is itself article
 * content, and `whyMatched` names the section a match came from, so headings are mapped to
 * these generic names and nothing else is ever stored (ADR 0003, ADR 0024).
 */
export const fullTextLabelSchema = z.enum([
  'Introduction',
  'Methods',
  'Results',
  'Discussion',
  'Conclusion',
  'Case report',
]);

export type FullTextLabel = z.infer<typeof fullTextLabelSchema>;

/**
 * A section of an article's full text as an enricher returns it: plain paragraphs, with a
 * generic label when the heading maps to one. Ingestion adds origin, source and licence.
 */
export const fullTextSectionSchema = z.object({
  label: fullTextLabelSchema.optional(),
  paragraphs: z.array(z.string().min(1)).min(1),
});

export type FullTextSection = z.infer<typeof fullTextSectionSchema>;
