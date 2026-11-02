import { z } from 'zod';

/**
 * A short subject label. The origin is kept so subjects can be filtered or purged by
 * where they came from (ADR 0004).
 */
export const subjectSchema = z.object({
  label: z.string().min(1).max(120),
  origin: z.enum(['mesh', 'keyword', 'journal']),
});

export type Subject = z.infer<typeof subjectSchema>;
