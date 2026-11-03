import { z } from 'zod';
import type { Enrichment } from '../ports/article-enricher.js';
import { issnSchema, type Journal } from './journal.js';
import { subjectSchema, type Subject } from './subject.js';

/**
 * A curated preset of journal-level subjects, such as `presets/thieme.subjects.json`
 * (ADR 0004). Each journal is listed once with all its ISSNs; the name is for the curator.
 */
export const journalSubjectsPresetSchema = z
  .array(
    z.strictObject({
      name: z.string().min(1),
      issns: z.array(issnSchema).min(1),
      subjects: z.array(subjectSchema.shape.label).min(1),
    }),
  )
  .superRefine((journals, context) => {
    const seen = new Set<string>();
    for (const [index, journal] of journals.entries()) {
      for (const issn of journal.issns) {
        if (seen.has(issn)) {
          context.addIssue({ code: 'custom', path: [index, 'issns'], message: `${issn} repeats` });
        }
        seen.add(issn);
      }
    }
  });

export type JournalSubjectsPreset = z.infer<typeof journalSubjectsPresetSchema>;

/** Journal-level subject labels by ISSN. */
export type JournalSubjects = ReadonlyMap<string, readonly Subject[]>;

/** Indexes a preset by every ISSN it lists. */
export function journalSubjectsOf(preset: JournalSubjectsPreset): JournalSubjects {
  return new Map(
    preset.flatMap(({ issns, subjects }) => {
      const labelled = subjects.map((label): Subject => ({ label, origin: 'journal' }));
      return issns.map((issn) => [issn, labelled] as const);
    }),
  );
}

/**
 * Adds the journal's subjects to an enrichment that has no article-level ones (MeSH or
 * keywords), so every article has some topic label; otherwise returns it unchanged. The
 * full-text reference is kept.
 */
export function withJournalSubjects(
  enrichment: Enrichment | undefined,
  journal: Journal,
  catalog: JournalSubjects,
): Enrichment | undefined {
  const subjects = enrichment?.subjects ?? [];
  if (subjects.some((subject) => subject.origin !== 'journal')) return enrichment;
  const fallback =
    catalog.get(journal.issnPrint ?? '') ?? catalog.get(journal.issnElectronic ?? '') ?? [];
  if (fallback.length === 0) return enrichment;
  return { ...enrichment, subjects: [...subjects, ...fallback] };
}
