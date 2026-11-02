import type { SearchFilters } from '@scholarly-mcp/core';
import type { SearchRequest } from '@scholarly-mcp/search';

/** One query of the latency bench, in the group it is reported under. */
export interface BenchCase {
  readonly group: 'de' | 'en' | 'mixed' | 'edge' | 'filtered' | 'doi';
  readonly request: SearchRequest;
}

const LIMIT = 10;

const QUERIES: Readonly<Record<'de' | 'en' | 'mixed' | 'edge', readonly string[]>> = {
  de: [
    'Vorhofflimmern Antikoagulation im Alter',
    'Therapie der Herzinsuffizienz',
    'Schlaganfall Prävention',
    'Gestationsdiabetes Schwangerschaft',
    'Knieendoprothese Rehabilitation',
    'Lungenembolie Diagnostik',
    'kolorektales Karzinom Vorsorge',
    'Sepsis auf der Intensivstation',
    'Depression bei Jugendlichen',
    'Arbeitsbelastung der Aerzte',
    'Vorhofflimmertherapie',
  ],
  en: [
    'atrial fibrillation anticoagulation in elderly patients',
    'heart failure treatment',
    'stroke prevention',
    'gestational diabetes outcomes',
    'total knee arthroplasty rehabilitation',
    'pulmonary embolism diagnosis',
    'colorectal cancer screening',
    'sepsis in the intensive care unit',
    'depression in adolescents',
    'machine learning in radiology',
    'Rivaroxaban dosing in patients with atrial fibrillation',
  ],
  mixed: [
    'Therapie of atrial fibrillation',
    'VHF',
    'COPD Exazerbation',
    'KHK',
    'TAVI outcomes',
    'MRT Knie',
    'NOAK Blutung',
  ],
  edge: [
    'die der das',
    'x',
    '"stroke" AND NEAR(dose*) -aspirin',
    'Behandlung von Patienten mit Vorhofflimmern und Herzinsuffizienz '.repeat(8),
  ],
};

const FILTERS: readonly SearchFilters[] = [
  { language: 'de' },
  { language: 'en', yearFrom: 2025 },
  { openAccessOnly: true },
];

/**
 * The bench's queries: German, English, mixed-language and abbreviation queries, edge cases
 * (stopwords only, one letter, query syntax, the 500-character cap), a few with filters, and
 * DOI lookups for the given DOIs. Synthetic topics only; no patient details.
 */
export function benchCases(dois: readonly string[]): BenchCase[] {
  const text = (Object.keys(QUERIES) as (keyof typeof QUERIES)[]).flatMap((group) =>
    QUERIES[group].map((query) => ({ group, request: { query, filters: {}, limit: LIMIT } })),
  );
  const filtered = FILTERS.flatMap((filters) =>
    QUERIES.en.slice(0, 3).map((query) => ({
      group: 'filtered' as const,
      request: { query, filters, limit: LIMIT },
    })),
  );
  const lookups = dois.map((doi) => ({
    group: 'doi' as const,
    request: { query: `https://doi.org/${doi}`, filters: {}, limit: LIMIT },
  }));
  return [...text, ...filtered, ...lookups];
}
