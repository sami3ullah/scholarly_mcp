import { articleSchema, type Article, type Subject } from '@scholarly-mcp/core';

/** A fluent, immutable builder for valid articles. Every method returns a new builder. */
export interface ArticleBuilder {
  withDoi(doi: string): ArticleBuilder;
  withTitle(title: string): ArticleBuilder;
  withAbstract(text: string): ArticleBuilder;
  withoutAbstract(): ArticleBuilder;
  withLanguage(language: string): ArticleBuilder;
  inJournal(name: string, issn: string): ArticleBuilder;
  publishedIn(year: number, month?: number, day?: number): ArticleBuilder;
  withSubjects(...subjects: Subject[]): ArticleBuilder;
  withContentHash(hash: string): ArticleBuilder;
  updatedAt(date: Date): ArticleBuilder;
  openAccess(): ArticleBuilder;
  retracted(): ArticleBuilder;
  /** Validates against the core schema, so a builder can never produce an invalid article. */
  build(): Article;
}

const DEFAULTS = {
  doi: '10.1055/a-0000-0001',
  title: 'Rivaroxaban dosing in patients with atrial fibrillation',
  journal: { name: 'Thrombosis and Haemostasis', issnPrint: '0340-6245' },
  authors: [{ given: 'Ada', family: 'Lovelace' }],
  published: { year: 2024, month: 3, day: 14 },
  language: 'en',
  abstract: 'Background: Dosing matters. Conclusion: Lower doses were not inferior.',
  subjects: [],
  licenses: [],
  isOpenAccess: false,
  isRetracted: false,
  landingUrl: 'https://www.thieme-connect.de/products/ejournals/abstract/10.1055/a-0000-0001',
  contentHash: '0'.repeat(64),
  sourceUpdatedAt: new Date('2024-03-15T00:00:00Z'),
  ingestedAt: new Date('2024-03-16T00:00:00Z'),
};

type Draft = Record<string, unknown>;

/** Starts a builder for a plausible English journal article with an abstract. */
export function anArticle(draft: Draft = DEFAULTS): ArticleBuilder {
  const next = (changes: Draft): ArticleBuilder => anArticle({ ...draft, ...changes });
  return {
    withDoi: (doi) =>
      next({ doi, landingUrl: `https://www.thieme-connect.de/products/ejournals/abstract/${doi}` }),
    withTitle: (title) => next({ title }),
    withAbstract: (abstract) => next({ abstract }),
    withoutAbstract: () =>
      anArticle(Object.fromEntries(Object.entries(draft).filter(([key]) => key !== 'abstract'))),
    withLanguage: (language) => next({ language }),
    inJournal: (name, issn) => next({ journal: { name, issnPrint: issn } }),
    publishedIn: (year, month, day) =>
      next({ published: { year, ...(month && { month }), ...(day && { day }) } }),
    withSubjects: (...subjects) => next({ subjects }),
    withContentHash: (contentHash) => next({ contentHash }),
    updatedAt: (sourceUpdatedAt) => next({ sourceUpdatedAt }),
    openAccess: () =>
      next({
        isOpenAccess: true,
        licenses: [
          {
            url: 'https://creativecommons.org/licenses/by/4.0/',
            contentVersion: 'vor',
            start: new Date('2024-01-01T00:00:00Z'),
          },
        ],
      }),
    retracted: () => next({ isRetracted: true }),
    build: () => articleSchema.parse(draft),
  };
}
