import { z } from 'zod';

/**
 * Crossref settings (ADR 0014). `CROSSREF_PREFIX` scopes the corpus, e.g. `10.1055` from the
 * Thieme preset. `CROSSREF_MAILTO` joins the polite pool; without it the public pool is used
 * (ADR 0005). The rest have safe defaults.
 */
export const crossrefConfigSchema = z.object({
  CROSSREF_PREFIX: z.string().regex(/^10\.\d{4,9}$/, 'Expected a DOI prefix such as 10.1055'),
  CROSSREF_FROM_PUB_DATE: z.iso.date().optional(),
  CROSSREF_MAILTO: z.email().optional(),
  CROSSREF_API_URL: z.url({ protocol: /^https?$/ }).default('https://api.crossref.org'),
  CROSSREF_ROWS: z.coerce.number().int().min(1).max(1000).default(100),
  CROSSREF_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  CROSSREF_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(6),
});

export type CrossrefConfig = z.output<typeof crossrefConfigSchema>;
