import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { splitSentences } from './split-sentences.js';

describe('splitSentences', () => {
  it('splits on sentence ends and keeps trailing whitespace', () => {
    expect(splitSentences('One is here. Two is there! Three?')).toEqual([
      'One is here. ',
      'Two is there! ',
      'Three?',
    ]);
  });

  it('does not split decimals', () => {
    expect(splitSentences('The rate was 0.05 in total. Next.')).toEqual([
      'The rate was 0.05 in total. ',
      'Next.',
    ]);
  });

  it.each([
    ['et al.', 'As Smith et al. Reported earlier, it works. Next.'],
    ['e.g.', 'Some drugs, e.g. Rivaroxaban, help. Next.'],
    ['Dr.', 'Treated by Dr. Müller in Bonn. Next.'],
    ['z. B.', 'Einige Mittel, z. B. Heparin, helfen. Weiter.'],
    ['Fig.', 'As shown in Fig. 2 the effect holds. Next.'],
  ])('does not split after %s', (_abbreviation, text) => {
    expect(splitSentences(text, 'de')).toHaveLength(2);
  });

  it('gives back the input exactly when joined', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', maxLength: 300 }), (text) => {
        expect(splitSentences(text).join('')).toBe(text);
      }),
    );
  });
});
