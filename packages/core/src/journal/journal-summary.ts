import { z } from 'zod';
import { issnSchema } from '../article/journal.js';
import { subjectSchema } from '../article/subject.js';

/** How many subjects a journal summary keeps, most frequent first. */
export const JOURNAL_SUBJECT_LIMIT = 10;

/**
 * A journal as the index sees it, built from indexed articles only (ARCHITECTURE.md tool
 * contracts): no claim about the journal goes beyond what its indexed records show.
 */
export const journalSummarySchema = z.object({
  /** The name most of its indexed articles carry. */
  name: z.string().min(1),
  issnPrint: issnSchema.optional(),
  issnElectronic: issnSchema.optional(),
  articleCount: z.int().positive(),
  openAccessCount: z.int().nonnegative(),
  firstYear: z.int(),
  lastYear: z.int(),
  /** Subject labels with how many of its articles carry them, most frequent first. */
  subjects: z
    .array(subjectSchema.extend({ articleCount: z.int().positive() }))
    .max(JOURNAL_SUBJECT_LIMIT),
});

export type JournalSummary = z.infer<typeof journalSummarySchema>;
