import { z } from 'zod';

/**
 * Europe PMC settings (ADR 0014). Europe PMC publishes no hard rate limit, so requests are
 * spaced by `EUROPEPMC_REQUEST_GAP_MS` (5 per second by default) and 429s are honoured.
 */
export const europepmcConfigSchema = z.object({
  EUROPEPMC_API_URL: z
    .url({ protocol: /^https?$/ })
    .default('https://www.ebi.ac.uk/europepmc/webservices/rest'),
  EUROPEPMC_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(100),
  EUROPEPMC_REQUEST_GAP_MS: z.coerce.number().int().min(0).max(60_000).default(200),
  EUROPEPMC_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  EUROPEPMC_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
});

export type EuropepmcConfig = z.output<typeof europepmcConfigSchema>;
