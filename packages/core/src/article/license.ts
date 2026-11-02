import { z } from 'zod';

/**
 * A licence entry as deposited with Crossref. `vor` is the version of record, which is the
 * one that decides whether full text may be used (see ADR 0003).
 */
export const licenseSchema = z.object({
  url: z.url(),
  contentVersion: z.enum(['vor', 'am', 'tdm', 'unspecified']),
  start: z.date(),
});

export type License = z.infer<typeof licenseSchema>;
