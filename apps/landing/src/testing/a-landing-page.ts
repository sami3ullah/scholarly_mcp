import {
  landingPageSchema,
  type LandingArticleSummary,
  type LandingPage,
} from '@scholarly-mcp/core';

/** A plausible article summary for tests. */
export function aSummary(doi: string, title: string): LandingArticleSummary {
  return {
    doi,
    title,
    journal: 'DMW - Deutsche Medizinische Wochenschrift',
    year: 2025,
    firstAuthor: 'Ada Lovelace',
    teaser: `Teaser of ${title}.`,
    access: 'subscription',
    retracted: false,
  };
}

/** A valid landing page for an active session, with overrides; checked against the schema. */
export function aLandingPage(overrides: Partial<LandingPage> = {}): LandingPage {
  return landingPageSchema.parse({
    session: 'active',
    language: 'en',
    topics: ['Atrial Fibrillation', 'Anticoagulants'],
    chosen: {
      ...aSummary('10.1055/a-1001', 'Oral anticoagulation in the elderly'),
      access: 'open',
      authors: ['Ada Lovelace', 'Grace Hopper'],
      authorCount: 12,
      published: { year: 2025, month: 9 },
      language: 'en',
      abstract: 'Background: Older patients bleed more.\n\nResults: Lower doses were safe.',
      subjects: ['Atrial Fibrillation', 'Anticoagulants'],
      license: 'https://creativecommons.org/licenses/by/4.0/',
      articleUrl: 'https://publisher.example/article/10.1055/a-1001',
      doiUrl: 'https://doi.org/10.1055/a-1001',
    },
    access: { status: 'open' },
    matchedPassage: { in: 'abstract', text: 'Lower doses were safe.', section: 'Results' },
    matches: [
      aSummary('10.1055/a-1002', 'Rivaroxaban dosing'),
      aSummary('10.1055/a-1003', 'Stroke prevention'),
    ],
    related: [aSummary('10.1055/a-2001', 'Ablation and anticoagulation')],
    ...overrides,
  });
}
