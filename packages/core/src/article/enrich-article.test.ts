import { describe, expect, it } from 'vitest';
import type { FullTextRef } from './full-text-ref.js';
import { articleSchema, type Article } from './article.js';
import { enrichArticle, withoutFullText } from './enrich-article.js';
import { hashArticleContent } from './hash-article-content.js';

const ref: FullTextRef = {
  source: 'europepmc',
  id: 'PMC11288659',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  revision: '2024-08-01',
};

async function anArticle(): Promise<Article> {
  const content = {
    doi: articleSchema.shape.doi.parse('10.1055/a-2272-9794'),
    title: 'Vertical tumor-positive resection margins',
    journal: { name: 'Endoscopy', issnPrint: '0013-726X' },
    authors: [],
    published: { year: 2024 },
    subjects: [{ label: 'Endoscopy', origin: 'journal' as const }],
    licenses: [],
    isOpenAccess: true,
    isRetracted: false,
    landingUrl: 'https://doi.org/10.1055/a-2272-9794',
  };
  return articleSchema.parse({
    ...content,
    contentHash: await hashArticleContent(content),
    sourceUpdatedAt: new Date('2026-11-01T00:00:00Z'),
    ingestedAt: new Date('2026-11-02T00:00:00Z'),
  });
}

describe('enrichArticle', () => {
  it('adds subjects and the full-text reference and rehashes the content', async () => {
    const article = await anArticle();
    const enriched = await enrichArticle(article, {
      subjects: [
        { label: 'Barrett Esophagus', origin: 'mesh' },
        { label: 'endoscopy', origin: 'journal' },
        { label: 'Endoscopy', origin: 'keyword' },
      ],
      fullText: ref,
    });
    expect(articleSchema.parse(enriched)).toEqual(enriched);
    expect(enriched.subjects).toEqual([
      { label: 'Endoscopy', origin: 'journal' },
      { label: 'Barrett Esophagus', origin: 'mesh' },
      { label: 'Endoscopy', origin: 'keyword' },
    ]);
    expect(enriched.fullText).toEqual(ref);
    expect(enriched.contentHash).not.toBe(article.contentHash);
    expect(enriched.sourceUpdatedAt).toEqual(article.sourceUpdatedAt);
  });

  it('hashes the same for the same enrichment, and differently for another revision', async () => {
    const article = await anArticle();
    const once = await enrichArticle(article, { subjects: [], fullText: ref });
    const twice = await enrichArticle(once, { subjects: [], fullText: ref });
    const revised = await enrichArticle(article, {
      subjects: [],
      fullText: { ...ref, revision: '2025-01-01' },
    });
    expect(twice.contentHash).toBe(once.contentHash);
    expect(revised.contentHash).not.toBe(once.contentHash);
  });

  it('leaves an article without a match as its source emitted it', async () => {
    const article = await anArticle();
    expect(await enrichArticle(article, undefined)).toEqual(article);
  });

  it('clears a reference the enricher no longer gives', async () => {
    const article = await anArticle();
    const withText = await enrichArticle(article, { subjects: [], fullText: ref });
    const without = await enrichArticle(withText, { subjects: [] });
    expect(without).not.toHaveProperty('fullText');
    expect(without.contentHash).toBe(article.contentHash);
  });
});

describe('withoutFullText', () => {
  it('drops the reference and restores the hash of the article without it', async () => {
    const article = await anArticle();
    const withText = await enrichArticle(article, { subjects: [], fullText: ref });
    const dropped = await withoutFullText(withText);
    expect(dropped).not.toHaveProperty('fullText');
    expect(dropped.contentHash).toBe(article.contentHash);
  });
});
