import { readFileSync } from 'node:fs';
import {
  journalSubjectsOf,
  journalSubjectsPresetSchema,
  type JournalSubjects,
} from '@scholarly-mcp/core';

/**
 * Reads and checks a journal-level subjects preset (ADR 0004). A missing or malformed file
 * stops the ingest before it starts, like any other bad setting.
 */
export function loadJournalSubjects(path: string): JournalSubjects {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`JOURNAL_SUBJECTS_FILE could not be read as JSON: ${path}`, { cause: error });
  }
  const parsed = journalSubjectsPresetSchema.safeParse(raw);
  if (parsed.success) return journalSubjectsOf(parsed.data);
  const problems = parsed.error.issues.map(
    (issue) => `- ${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`,
  );
  throw new Error(`Invalid JOURNAL_SUBJECTS_FILE ${path}:\n${problems.join('\n')}`);
}
