import { z } from 'zod';

/** The citation formats `cite` offers (PLAN.md tool contracts). */
export const citationStyleSchema = z.enum(['vancouver', 'apa', 'ama', 'bibtex', 'ris']);

export type CitationStyle = z.infer<typeof citationStyleSchema>;
