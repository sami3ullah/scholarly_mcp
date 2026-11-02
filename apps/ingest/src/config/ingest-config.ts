import { z } from 'zod';

/**
 * Ingest settings (ADR 0014). `ingest incremental` turns into a full run when the last full
 * run is older than `INGEST_FULL_RUN_DAYS`, because only full runs re-fetch unchanged
 * records and so open embargoed licences (ADR 0020).
 */
export const ingestConfigSchema = z.object({
  INGEST_FULL_RUN_DAYS: z.coerce.number().int().min(1).max(365).default(7),
});

export type IngestConfig = z.output<typeof ingestConfigSchema>;
