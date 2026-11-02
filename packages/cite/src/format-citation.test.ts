import { articleSchema, type Article } from '@scholarly-mcp/core';
import { anArticle } from '@scholarly-mcp/testkit';
import { describe, expect, it } from 'vitest';
import { citationStyleSchema } from './citation-style.js';
import { formatCitation } from './format-citation.js';

const full = anArticle()
  .withDoi('10.1055/a-2245-1234')
  .withTitle('Rivaroxaban dosing in patients with atrial fibrillation')
  .inJournal('Thrombosis and Haemostasis', '0340-6245')
  .publishedIn(2024, 3, 14)
  .build();

const german: Article = articleSchema.parse({
  ...anArticle()
    .withDoi('10.1055/a-2300-0001')
    .withTitle('Vorhofflimmern im Alter')
    .withLanguage('de')
    .inJournal('DMW - Deutsche Medizinische Wochenschrift', '0012-0472')
    .publishedIn(2025, 1)
    .build(),
  subtitle: 'Eine Kohortenstudie',
  authors: [
    { given: 'Jörg', family: 'Müller' },
    { given: 'Anna', family: 'Schmidt' },
    { family: 'Weber' },
    { given: 'Lena', family: 'Fischer' },
    { given: 'Paul', family: 'Wagner' },
    { given: 'Eva', family: 'Becker' },
    { given: 'Tim', family: 'Hoffmann' },
  ],
});

const sparse: Article = {
  ...anArticle().withDoi('10.1055/s-0044-1').publishedIn(2024).build(),
  authors: [],
};

describe('formatCitation', () => {
  describe.each(citationStyleSchema.options)('%s', (style) => {
    it.each([
      ['a fully dated article', full],
      ['a German article with a subtitle and seven authors', german],
      ['a year-only article without authors', sparse],
    ])('formats %s', (_case, article) => {
      expect(formatCitation(article, style)).toMatchSnapshot();
    });

    it('carries the DOI and nothing from the abstract', () => {
      const text = formatCitation(full, style);
      expect(text).toContain('10.1055/a-2245-1234');
      expect(text).not.toContain('Dosing matters');
    });
  });

  it("points BibTeX and RIS at the publisher's landing page", () => {
    for (const style of ['bibtex', 'ris'] as const) {
      expect(formatCitation(full, style)).toContain(full.landingUrl);
    }
  });

  it('keeps every RIS value on one line, however long', () => {
    const long = { ...full, title: 'A very long title '.repeat(10).trim() };
    const lines = formatCitation(long, 'ris').split('\n');
    expect(lines.every((line) => /^[A-Z][A-Z0-9] {2}-/.test(line))).toBe(true);
    expect(lines).toContain(`TI  - ${long.title}`);
  });

  it('prints a year-only date as the year, without an invented month or day', () => {
    expect(formatCitation(sparse, 'apa')).toContain('(2024)');
    expect(formatCitation(sparse, 'ris')).not.toMatch(/DA {2}- 2024\/\d/);
  });

  it('drops the list number of numeric styles', () => {
    expect(formatCitation(full, 'vancouver')).toMatch(/^Lovelace A\./);
  });
});
