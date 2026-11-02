import type { JournalSummary } from '../journal/journal-summary.js';

/** The journals of the index, built from its articles only. */
export interface JournalDirectory {
  /** Every journal with at least one indexed article, sorted by name. */
  journals(signal: AbortSignal): Promise<JournalSummary[]>;
}
