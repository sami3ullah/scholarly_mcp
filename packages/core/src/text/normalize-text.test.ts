import { describe, expect, it } from 'vitest';
import { normalizeText } from './normalize-text.js';

describe('normalizeText', () => {
  it('composes NFD umlauts so they equal their precomposed form', () => {
    expect(normalizeText('Gefäß')).toBe('Gefäß');
  });

  it('removes soft hyphens so a hyphenated German compound matches the plain word', () => {
    expect(normalizeText('Herz­insuffizienz')).toBe('Herzinsuffizienz');
  });

  it.each([
    ['zero-width space', '​'],
    ['zero-width non-joiner', '‌'],
    ['zero-width joiner', '‍'],
    ['word joiner', '⁠'],
    ['byte-order mark', '﻿'],
    ['null', '\u0000'],
    ['escape', '\u001B'],
    ['C1 control', '\u0085'],
  ])('strips a %s', (_name, character) => {
    expect(normalizeText(`Leber${character}zirrhose`)).toBe('Leberzirrhose');
  });

  it('keeps tabs and newlines, which carry layout', () => {
    expect(normalizeText('Methods:\tA\nResults: B')).toBe('Methods:\tA\nResults: B');
  });
});
