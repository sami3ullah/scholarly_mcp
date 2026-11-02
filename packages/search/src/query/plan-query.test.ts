import { describe, expect, it } from 'vitest';
import { planQuery, type QueryPlan } from './plan-query.js';

const textPlan = (query: string): Extract<QueryPlan, { kind: 'text' }> => {
  const plan = planQuery(query);
  if (plan.kind !== 'text') throw new Error(`Expected a text plan for ${query}`);
  return plan;
};

describe('planQuery', () => {
  it.each([
    ['10.1055/a-1234-5678', '10.1055/a-1234-5678'],
    ['https://doi.org/10.1055/A-1234-5678', '10.1055/a-1234-5678'],
    ['doi:10.1055/s-0043-123.', '10.1055/s-0043-123'],
    ['see (10.1055/a-1)', '10.1055/a-1'],
    ['10.1016/S0140-6736(20)30183-5', '10.1016/s0140-6736(20)30183-5'],
    ['dosing in 10.1055/a-99, please', '10.1055/a-99'],
  ])('looks %j up as the DOI %s', (query, doi) => {
    expect(planQuery(query)).toEqual({ kind: 'doi', doi });
  });

  it('keeps meaningful words as lexical terms', () => {
    expect(textPlan('Rivaroxaban dosing in elderly patients').terms).toEqual([
      'Rivaroxaban',
      'dosing',
      'elderly',
      'patients',
    ]);
  });

  it('searches a stopword-only query by meaning alone', () => {
    const plan = textPlan('die der das');
    expect(plan.terms).toEqual([]);
    expect(plan.embeddingText).toBe('die der das');
  });

  it('leaves single characters out of the lexical terms', () => {
    expect(textPlan('x').terms).toEqual([]);
  });

  it('keeps mixed-language words and stems in both languages', () => {
    const plan = textPlan('Therapie of atrial fibrillation');
    expect(plan.terms).toEqual(['Therapie', 'atrial', 'fibrillation']);
    expect(plan.language).toBeUndefined();
  });

  it('detects a clearly German query', () => {
    expect(textPlan('Die Therapie der Patienten mit Vorhofflimmern im Alter').language).toBe('de');
  });

  it('drops repeated words, whatever their spelling', () => {
    expect(textPlan('Ärzte aerzte ÄRZTE').terms).toEqual(['Ärzte']);
  });

  it('adds abbreviation expansions to the terms and the embedded text', () => {
    const plan = textPlan('VHF Antikoagulation');
    expect(plan.words).toEqual(['VHF', 'Antikoagulation']);
    expect(plan.terms).toEqual([
      'VHF',
      'Antikoagulation',
      'AF',
      'atrial fibrillation',
      'Vorhofflimmern',
    ]);
    expect(plan.embeddingText).toBe(
      'VHF Antikoagulation (AF, atrial fibrillation, Vorhofflimmern)',
    );
  });

  it('treats FTS syntax as words, and AND as the stopword it is', () => {
    expect(textPlan('"stroke" AND NEAR(dose*) -aspirin').terms).toEqual([
      'stroke',
      'NEAR',
      'dose',
      'aspirin',
    ]);
  });
});
