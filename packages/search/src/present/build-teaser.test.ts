import { TEASER_MAX_LENGTH } from '@scholarly-mcp/core';
import { describe, expect, it } from 'vitest';
import { buildTeaser } from './build-teaser.js';

const teaser = (abstract: string | undefined, language = 'en') =>
  buildTeaser(abstract === undefined ? { language } : { abstract, language });

describe('buildTeaser', () => {
  it('skips a heading that opens the abstract as a short question (DMW "Was ist neu?")', () => {
    expect(
      teaser(
        'Was ist neu? Bei Verdacht auf Thrombose ist die Duplexsonografie die Methode der Wahl. Mehr folgt.',
        'de',
      ),
    ).toBe('Bei Verdacht auf Thrombose ist die Duplexsonografie die Methode der Wahl.');
    expect(teaser('Is it safe?')).toBe('Is it safe?');
  });

  it('is empty when there is no abstract', () => {
    expect(teaser(undefined)).toBe('');
  });

  it('uses the first sentence of the conclusion section', () => {
    expect(
      teaser(
        'Background: Dosing matters.\n\nResults: Fewer bleeds.\n\nConclusion: Lower doses were not inferior. More work is needed.',
      ),
    ).toBe('Lower doses were not inferior.');
  });

  it.each([
    ['Schlussfolgerung'],
    ['Schlussfolgerungen'],
    ['Fazit'],
    ['Conclusions'],
    ['Interpretation'],
  ])('recognises the %s label', (label) => {
    expect(teaser(`Hintergrund: Warum.\n\n${label}: Es hilft. Mehr nicht.`, 'de')).toBe(
      'Es hilft.',
    );
  });

  it('uses a sentence that opens a conclusion when there are no labels', () => {
    expect(
      teaser('We studied 40 patients. Most improved. In conclusion, the drug was safe. Thanks.'),
    ).toBe('In conclusion, the drug was safe.');
  });

  it('uses the first sentence otherwise', () => {
    expect(teaser('We studied 40 patients. Most improved.')).toBe('We studied 40 patients.');
  });

  it('cuts a long sentence at a word boundary with an ellipsis', () => {
    const long = `${'Anticoagulation '.repeat(30)}works.`;
    const result = teaser(long);
    expect(result.length).toBeLessThanOrEqual(TEASER_MAX_LENGTH);
    expect(result).toMatch(/Anticoagulation…$/);
  });
});
