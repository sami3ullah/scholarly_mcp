import { describe, expect, it } from 'vitest';
import { splitLeadingHeading } from './leading-heading.js';

describe('splitLeadingHeading', () => {
  it.each([
    [
      'Background and study aims Patients with PSC',
      'Background and study aims',
      'Patients with PSC',
    ],
    ['Results A total of 504 samples', 'Results', 'A total of 504 samples'],
    ['Conclusions In PSC patients', 'Conclusions', 'In PSC patients'],
    ['Ergebnisse 42 Patienten', 'Ergebnisse', '42 Patienten'],
    ['Material und Methoden Wir untersuchten', 'Material und Methoden', 'Wir untersuchten'],
  ])('splits the run-in heading from "%s"', (paragraph, label, text) => {
    expect(splitLeadingHeading(paragraph)).toEqual({ label, text });
  });

  it.each([
    'Results of the trial were mixed.',
    'Background noise matters.',
    'Die Ergebnisse zeigen einen Effekt.',
    'Methods: already labelled.',
  ])('leaves "%s" alone', (paragraph) => {
    expect(splitLeadingHeading(paragraph)).toEqual({ text: paragraph });
  });
});
