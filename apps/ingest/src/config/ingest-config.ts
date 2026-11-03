import { z } from 'zod';

/**
 * Ingest settings (ADR 0014). `ingest incremental` turns into a full run when the last full
 * run is older than `INGEST_FULL_RUN_DAYS`, because only full runs re-fetch unchanged
 * records and so open embargoed licences (ADR 0020) and pick up new Europe PMC full text.
 * `EUROPEPMC_ENABLED` adds Europe PMC subjects and matching-only full text (ADR 0024).
 * `JOURNAL_SUBJECTS_FILE` names a journal-level subjects preset for articles without
 * article-level subjects (ADR 0004).
 */
export const ingestConfigSchema = z.object({
  INGEST_FULL_RUN_DAYS: z.coerce.number().int().min(1).max(365).default(7),
  EUROPEPMC_ENABLED: z.stringbool().default(false),
  JOURNAL_SUBJECTS_FILE: z.string().min(1).optional(),
});

export type IngestConfig = z.output<typeof ingestConfigSchema>;
