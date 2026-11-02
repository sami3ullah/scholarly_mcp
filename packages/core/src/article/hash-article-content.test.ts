import { describe, expect, it } from 'vitest';
import { articleSchema } from './article.js';
import { hashArticleContent, type ArticleContent } from './hash-article-content.js';

const content: ArticleContent = {
  doi: articleSchema.shape.doi.parse('10.1055/a-0000-0001'),
  title: 'Rivaroxaban dosing',
  journal: { name: 'Thrombosis and Haemostasis', issnPrint: '0340-6245' },
  authors: [{ given: 'Ada', family: 'Lovelace' }],
  published: { year: 2024, month: 3 },
  abstract: 'Background: Dosing matters.',
  subjects: [],
  licenses: [
    {
      url: 'https://creativecommons.org/licenses/by/4.0/',
      contentVersion: 'vor',
      start: new Date('2024-01-01T00:00:00Z'),
    },
  ],
  isOpenAccess: true,
  isRetracted: false,
  landingUrl: 'https://example.org/a',
};

describe('hashArticleContent', () => {
  it('returns a hex SHA-256 digest', async () => {
    expect(await hashArticleContent(content)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('ignores property order', async () => {
    const reordered = Object.fromEntries(Object.entries(content).reverse()) as ArticleContent;
    expect(await hashArticleContent(reordered)).toBe(await hashArticleContent(content));
  });

  it('changes when the content changes', async () => {
    const retracted = { ...content, isRetracted: true };
    expect(await hashArticleContent(retracted)).not.toBe(await hashArticleContent(content));
  });

  it('changes when a licence start date moves', async () => {
    const licenses = content.licenses.map((license) => ({
      ...license,
      start: new Date('2024-02-01T00:00:00Z'),
    }));
    expect(await hashArticleContent({ ...content, licenses })).not.toBe(
      await hashArticleContent(content),
    );
  });
});
