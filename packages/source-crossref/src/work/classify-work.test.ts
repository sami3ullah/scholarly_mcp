import { describe, expect, it } from 'vitest';
import { aCrossrefWork } from '../testing/a-crossref-work.js';
import { classifyWork } from './classify-work.js';

const retraction = (DOI: string) => ({ DOI, type: 'retraction' });

describe('classifyWork', () => {
  it('treats a plain journal article as an article', () => {
    expect(classifyWork(aCrossrefWork(), 'A study')).toEqual({
      kind: 'article',
      isRetracted: false,
      retracts: [],
    });
  });

  it.each(['book-chapter', 'proceedings-article', 'posted-content'])(
    'filters out %s records',
    (type) => {
      expect(classifyWork(aCrossrefWork({ type }), 'A chapter').kind).toBe('other-type');
    },
  );

  it('marks an article retracted when another record retracts it', () => {
    const work = aCrossrefWork({ 'updated-by': [retraction('10.1055/a-2575-5491')] });
    expect(classifyWork(work, 'A study').isRetracted).toBe(true);
  });

  it('marks an article retracted when Retraction Watch annotates the article itself', () => {
    const work = aCrossrefWork({
      DOI: '10.1055/S-2004-817674',
      'update-to': [retraction('10.1055/s-2004-817674')],
    });
    expect(classifyWork(work, 'Beeinflusst die Gabe von HES die Nierenfunktion?')).toMatchObject({
      kind: 'article',
      isRetracted: true,
      retracts: [],
    });
  });

  it.each(['withdrawal', 'removal'])('treats a %s as a retraction', (type) => {
    const work = aCrossrefWork({ 'updated-by': [{ DOI: '10.1055/x', type }] });
    expect(classifyWork(work, 'A study').isRetracted).toBe(true);
  });

  it.each(['correction', 'partial_retraction', 'expression_of_concern'])(
    'does not treat a %s of the article as a retraction',
    (type) => {
      const work = aCrossrefWork({ 'updated-by': [{ DOI: '10.1055/x', type }] });
      expect(classifyWork(work, 'A study').isRetracted).toBe(false);
    },
  );

  it.each(['Retracted Article: Prediction of survival', 'RETRACTED: A trial'])(
    'marks an article retracted by its title "%s"',
    (title) => {
      expect(classifyWork(aCrossrefWork(), title)).toMatchObject({
        kind: 'article',
        isRetracted: true,
      });
    },
  );

  it('skips a retraction notice and reports the article it retracts', () => {
    const work = aCrossrefWork({
      DOI: '10.1055/a-2575-5491',
      'update-to': [retraction('https://doi.org/10.1055/A-2458-7088')],
    });
    expect(classifyWork(work, 'Retraction Note: Prediction of survival')).toEqual({
      kind: 'notice',
      isRetracted: false,
      retracts: ['10.1055/a-2458-7088'],
    });
  });

  it('skips a correction notice without reporting a retraction', () => {
    const work = aCrossrefWork({ 'update-to': [{ DOI: '10.1055/a-1', type: 'correction' }] });
    expect(classifyWork(work, 'Some title')).toEqual({
      kind: 'notice',
      isRetracted: false,
      retracts: [],
    });
  });

  it('keeps a new version that supersedes another article', () => {
    const work = aCrossrefWork({ 'update-to': [{ DOI: '10.1055/a-1', type: 'new_version' }] });
    expect(classifyWork(work, 'Updated guideline').kind).toBe('article');
  });

  it.each([
    'Erratum: Pflanzen der Alpenwiesen',
    'Erratum',
    'Corrigendum to “A study” [Homeopathy 106 (2017)]',
    'Berichtigung',
    'Correction: A trial',
    'Correction to: A trial',
    'Retraction Note: A trial',
    'Retraction notice to “A trial”:',
    'Korrektur',
    'Expression of Concern: A trial',
  ])('flags the notice "%s" by its title when it has no relation', (title) => {
    expect(classifyWork(aCrossrefWork(), title).kind).toBe('notice');
  });

  it.each([
    'Correction of hallux valgus with a minimally invasive osteotomy',
    'Retraction of the gingiva after implant placement',
    'Errors in medication: a review',
  ])('keeps the article "%s" whose title only starts like a notice', (title) => {
    expect(classifyWork(aCrossrefWork(), title).kind).toBe('article');
  });
});
