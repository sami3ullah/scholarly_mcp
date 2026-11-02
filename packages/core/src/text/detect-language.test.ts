import { describe, expect, it } from 'vitest';
import { detectLanguage } from './detect-language.js';

describe('detectLanguage', () => {
  it.each([
    [
      'de',
      'Die Ergebnisse zeigen, dass eine frühe Antikoagulation bei Patienten mit Vorhofflimmern das Risiko senkt.',
    ],
    [
      'en',
      'The results show that early anticoagulation in patients with atrial fibrillation lowers the risk.',
    ],
    [
      'de',
      'Zusammenfassung der Studienlage zur Therapie des Typ-2-Diabetes im höheren Lebensalter',
    ],
    [
      'en',
      'Sjögren syndrome was diagnosed in 12 of the 40 patients, and none of them had received steroids.',
    ],
  ] as const)('detects %s', (language, text) => {
    expect(detectLanguage(text)).toBe(language);
  });

  it.each([
    ['a heading', '3.1 Copper Nanoparticles in Micelles'],
    ['a short greeting', 'Liebe Leserinnen, liebe Leser,'],
    ['empty text', ''],
    ['another language', 'Los resultados muestran una reducción del riesgo en pacientes tratados.'],
    ['an even mix', 'Die Studie ist klein. The study is small.'],
  ])('returns undefined for %s', (_case, text) => {
    expect(detectLanguage(text)).toBeUndefined();
  });
});
