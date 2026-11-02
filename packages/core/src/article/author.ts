import { z } from 'zod';

/** An article author; Crossref sometimes has only a family name or an organisation. */
export const authorSchema = z.object({
  given: z.string().min(1).optional(),
  family: z.string().min(1),
  orcid: z
    .string()
    .regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/, 'Expected a bare ORCID iD such as 0000-0002-1825-0097')
    .optional(),
});

export type Author = z.infer<typeof authorSchema>;
