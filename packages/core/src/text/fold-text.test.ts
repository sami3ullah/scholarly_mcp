import { describe, expect, it } from 'vitest';
import { foldText } from './fold-text.js';

describe('foldText', () => {
  it.each([
    ['Ärzte', 'Aerzte'],
    ['Straße', 'Strasse'],
    ['Übelkeit', 'Uebelkeit'],
    ['Größe', 'Groesse'],
  ])('folds %s and %s to the same text', (a, b) => {
    expect(foldText(a)).toBe(foldText(b));
  });

  it('treats NFD umlauts like NFC ones', () => {
    expect(foldText('Ärzte')).toBe(foldText('Ärzte'));
  });

  it('strips other diacritics', () => {
    expect(foldText('Café Señor')).toBe('cafe senor');
  });
});
