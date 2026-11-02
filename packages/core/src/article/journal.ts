import { z } from 'zod';

/** An ISSN in its printed form, e.g. `1438-8812`. */
export const issnSchema = z
  .string()
  .regex(/^\d{4}-\d{3}[\dX]$/, 'Expected an ISSN such as 1438-8812');

/** The journal an article appeared in. At least one ISSN is required to identify it. */
export const journalSchema = z
  .object({
    name: z.string().min(1),
    issnPrint: issnSchema.optional(),
    issnElectronic: issnSchema.optional(),
  })
  .refine((journal) => journal.issnPrint !== undefined || journal.issnElectronic !== undefined, {
    message: 'A journal needs a print or electronic ISSN',
  });

export type Journal = z.infer<typeof journalSchema>;
