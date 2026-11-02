import { describe, expect, it } from 'vitest';
import { articleSections } from './article-sections.js';

describe('articleSections', () => {
  it('turns a structured abstract into abstract sections', () => {
    const sections = articleSections(
      { title: 'T', abstract: 'Background: Why.\n\nResults: Better.' },
      'crossref',
    );
    expect(sections).toEqual([
      { label: 'Background', paragraphs: ['Why.'], origin: 'abstract', source: 'crossref' },
      { label: 'Results', paragraphs: ['Better.'], origin: 'abstract', source: 'crossref' },
    ]);
  });

  it('indexes the title and subtitle when there is no abstract', () => {
    expect(
      articleSections({ title: 'Vorhofflimmern', subtitle: 'Ein Update' }, 'crossref'),
    ).toEqual([
      { paragraphs: ['Vorhofflimmern: Ein Update'], origin: 'metadata', source: 'crossref' },
    ]);
  });

  it('indexes the title alone when there is neither abstract nor subtitle', () => {
    expect(articleSections({ title: 'Vorhofflimmern' }, 'crossref')[0]?.paragraphs).toEqual([
      'Vorhofflimmern',
    ]);
  });
});
