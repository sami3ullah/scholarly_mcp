import { describe, expect, it } from 'vitest';
import { isBackMatter, sectionLabel } from './section-label.js';

describe('sectionLabel', () => {
  it.each([
    ['Introduction', 'Introduction'],
    ['Background', 'Introduction'],
    ['Hintergrund', 'Introduction'],
    ['2. Materials and Methods', 'Methods'],
    ['Patienten und Methoden', 'Methods'],
    ['Methodik', 'Methods'],
    ['Results', 'Results'],
    ['Ergebnisse', 'Results'],
    ['Results and Discussion', 'Results'],
    ['Diskussion', 'Discussion'],
    ['Conclusions', 'Conclusion'],
    ['Schlussfolgerung', 'Conclusion'],
    ['Fazit für die Praxis', 'Conclusion'],
    ['Case Report', 'Case report'],
    ['Case 2', 'Case report'],
    ['Fallbericht', 'Case report'],
    ['IV. Discussion', 'Discussion'],
  ])('labels %j as %s', (title, label) => {
    expect(sectionLabel(title)).toBe(label);
  });

  it.each(['Epidemiology of thrombosis', 'Stärken und Limitationen', ''])(
    'gives no label to %j',
    (title) => {
      expect(sectionLabel(title)).toBeUndefined();
    },
  );

  it('gives no label without a title', () => {
    expect(sectionLabel(undefined)).toBeUndefined();
  });
});

describe('isBackMatter', () => {
  it.each([
    ['References', undefined],
    ['Literatur', undefined],
    ['Interessenkonflikt', undefined],
    ['Beiträge der Autor*innen', undefined],
    ['Verfügbarkeit von Daten und Materialien', undefined],
    ['Erratum', undefined],
    ['Correction', undefined],
    ['Figures 1–3', undefined],
    ['\nTables 1 s–6 s, Fig. 1 s\n: \n', undefined],
    ['Notes', 'fn-group'],
    [undefined, 'supplementary-material'],
  ])('treats %j (%s) as back matter', (title, secType) => {
    expect(isBackMatter(title, secType)).toBe(true);
  });

  it.each(['Methods', 'Correctional facilities', 'Tablet use in clinics', 'Figures of speech'])(
    'keeps %j',
    (title) => {
      expect(isBackMatter(title, undefined)).toBe(false);
    },
  );
});
