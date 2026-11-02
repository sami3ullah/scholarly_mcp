import { describe, expect, it } from 'vitest';
import { isCitationOnly } from './is-citation-only.js';

describe('isCitationOnly', () => {
  it.each([
    [
      'an et al. citation',
      'Griffiths GS, Thompson BL, Snell DL et al. Person-centred management of upper limb complex regional pain syndrome: an integrative review. Hand Therapy 2023; 28: 16–32',
    ],
    [
      'a citation with an issue number and hyphenated initials',
      'Franke H, Franke J-D, Fryer G. Wirksamkeit der osteopathischen Behandlung. Osteopathische Medizin 2022; 23 (4): 4–13',
    ],
    ['a citation ending with a DOI', 'Smith J. A trial. Lancet 2021; 397: 100-110. doi:10.1016/x'],
  ])('recognises %s', (_case, text) => {
    expect(isCitationOnly([text])).toBe(true);
  });

  it('needs every paragraph to be a citation', () => {
    const citation = 'Smith J. A trial. Lancet 2021; 397: 100-110';
    expect(isCitationOnly([citation, citation])).toBe(true);
    expect(isCitationOnly([citation, 'Diese Studie zeigt, dass die Therapie wirkt.'])).toBe(false);
  });

  it('keeps a real abstract that happens to end with a reference', () => {
    const abstract = `Background: ${'We studied patients. '.repeat(25)}See Smith J. Lancet 2021; 397: 100-110`;
    expect(isCitationOnly([abstract])).toBe(false);
  });

  it('keeps short prose', () => {
    expect(isCitationOnly(['Die Fußgesundheit ist eine wichtige Voraussetzung.'])).toBe(false);
  });

  it('is false for no paragraphs', () => {
    expect(isCitationOnly([])).toBe(false);
  });
});
