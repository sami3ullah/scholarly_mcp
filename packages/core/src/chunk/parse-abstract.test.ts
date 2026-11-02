import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseAbstract } from './parse-abstract.js';

describe('parseAbstract', () => {
  it('groups labelled paragraphs into sections', () => {
    expect(
      parseAbstract('Background: Why.\n\nMethods: How.\n\nMethods: More.\n\nResults: Better.'),
    ).toEqual([
      { label: 'Background', paragraphs: ['Why.'] },
      { label: 'Methods', paragraphs: ['How.', 'More.'] },
      { label: 'Results', paragraphs: ['Better.'] },
    ]);
  });

  it('keeps only the outer label of a nested section', () => {
    expect(
      parseAbstract('Aims: Why.\n\nResults: Overall.\n\nResults: Primary outcome: Better.'),
    ).toEqual([
      { label: 'Aims', paragraphs: ['Why.'] },
      { label: 'Results', paragraphs: ['Overall.', 'Primary outcome: Better.'] },
    ]);
  });

  it('keeps unlabelled paragraphs before the first label as their own section', () => {
    expect(parseAbstract('Intro text.\n\nZiel: A.\n\nMethode und Patienten: B.')).toEqual([
      { paragraphs: ['Intro text.'] },
      { label: 'Ziel', paragraphs: ['A.'] },
      { label: 'Methode und Patienten', paragraphs: ['B.'] },
    ]);
  });

  it('treats a lone colon phrase as text, not a label', () => {
    expect(parseAbstract('Two groups were compared: A and B.\n\nBoth improved.')).toEqual([
      { paragraphs: ['Two groups were compared: A and B.', 'Both improved.'] },
    ]);
  });

  it.each([
    ['too many words', 'One two three four five six: text.'],
    ['sentence punctuation', 'Dose, route: text.'],
    ['a lowercase start', 'background: text.'],
  ])('does not read a phrase with %s as a label', (_case, paragraph) => {
    expect(parseAbstract(`${paragraph}\n\nMethods: How.\n\nResults: Better.`)[0]).toEqual({
      paragraphs: [paragraph],
    });
  });

  it('returns no sections for an empty abstract', () => {
    expect(parseAbstract(' \n\n ')).toEqual([]);
  });

  it('never loses or reorders text', () => {
    const paragraph = fc
      .tuple(
        fc.option(fc.constantFrom('Background', 'Methods', 'Results', 'Fazit'), { nil: undefined }),
        fc.string({ minLength: 1, maxLength: 40 }).filter((text) => text.trim() !== ''),
      )
      .map(([label, text]) => (label === undefined ? text.trim() : `${label}: ${text.trim()}`));
    fc.assert(
      fc.property(fc.array(paragraph, { maxLength: 8 }), (paragraphs) => {
        const abstract = paragraphs.join('\n\n');
        const rebuilt = parseAbstract(abstract).flatMap((section) =>
          section.paragraphs.map((text) =>
            section.label === undefined ? text : `${section.label}: ${text}`,
          ),
        );
        expect(rebuilt.join('\n\n').split(/\s+/).join(' ')).toBe(
          abstract.trim().split(/\s+/).join(' '),
        );
      }),
    );
  });
});
