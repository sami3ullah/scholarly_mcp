import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cutAtWord } from './cut-at-word.js';

describe('cutAtWord', () => {
  it('keeps a text that fits', () => {
    expect(cutAtWord(' short text ', 20)).toBe('short text');
  });

  it('cuts at the last word boundary and drops trailing punctuation', () => {
    expect(cutAtWord('alpha beta, gamma delta', 18)).toBe('alpha beta…');
  });

  it('cuts one long word mid-word', () => {
    expect(cutAtWord('Vorhofflimmertherapieleitlinie', 10)).toBe('Vorhoffli…');
  });

  it('never splits a character made of two code units', () => {
    expect(cutAtWord('😀😀😀😀😀😀', 6)).toBe('😀😀…');
  });

  it('never returns more than the maximum', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: 'grapheme', maxLength: 400 }),
        fc.integer({ min: 2, max: 300 }),
        (text, max) => {
          expect(cutAtWord(text, max).length).toBeLessThanOrEqual(max);
        },
      ),
    );
  });
});
