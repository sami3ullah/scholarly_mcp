import { z } from 'zod';

/**
 * Where an ingestion run left off for one source, so a crash or an expired cursor resumes
 * from the last checkpoint instead of starting over. `lastFullRunAt` is when a full run last
 * succeeded; incremental runs never re-fetch unchanged records, so embargoes open only on full
 * runs (ADR 0020), which are scheduled from it.
 */
export const syncStateSchema = z.object({
  source: z.string().min(1),
  cursor: z.string().min(1).optional(),
  windowFrom: z.date().optional(),
  windowUntil: z.date().optional(),
  lastRunStatus: z.enum(['running', 'succeeded', 'failed']),
  lastRunAt: z.date(),
  lastFullRunAt: z.date().optional(),
});

export type SyncState = z.infer<typeof syncStateSchema>;
