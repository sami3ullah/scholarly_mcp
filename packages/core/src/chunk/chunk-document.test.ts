import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { doiSchema } from '../article/doi.js';
import {
  chunkDocument,
  type ChunkDraft,
  type ChunkSection,
  type ChunkableDocument,
} from './chunk-document.js';

/** One token per word keeps the expected sizes readable; the real embedder counts subwords. */
const countWords = (text: string) => text.split(/\s+/).filter((word) => word !== '').length;
const options = { countTokens: countWords };

const EN = 'The patients with atrial fibrillation were treated for a year.';
const DE = 'Die Patienten mit Vorhofflimmern wurden über ein Jahr behandelt.';

/** A paragraph of `count` English sentences of ten words each, numbered so they differ. */
function sentences(count: number, word = 'patients'): string {
  return Array.from(
    { length: count },
    (_, index) => `The ${word} in group ${String(index)} were treated with the drug.`,
  ).join(' ');
}

function abstract(...sections: Partial<ChunkSection>[]): ChunkableDocument {
  return {
    doi: doiSchema.parse('10.1055/a-1'),
    title: 'Rivaroxaban dosing',
    sections: sections.map((section) => ({
      paragraphs: [],
      origin: 'abstract',
      source: 'crossref',
      ...section,
    })),
  };
}

describe('chunkDocument', () => {
  it('keeps a short section whole and puts the title in front of the embedding text', () => {
    const [chunk, ...rest] = chunkDocument(
      abstract({ label: 'Results', paragraphs: [EN] }),
      options,
    );
    expect(rest).toEqual([]);
    expect(chunk).toEqual({
      id: '10.1055/a-1#0',
      doi: '10.1055/a-1',
      ordinal: 0,
      section: 'Results',
      text: EN,
      language: 'en',
      tokenCount: 10,
      origin: 'abstract',
      source: 'crossref',
      embeddingText: `Rivaroxaban dosing\n\n${EN}`,
      overlapLength: 0,
    });
  });

  it('never lets a chunk span two sections', () => {
    const chunks = chunkDocument(
      abstract({ label: 'Background', paragraphs: [EN] }, { label: 'Methods', paragraphs: [EN] }),
      options,
    );
    expect(chunks.map((chunk) => [chunk.ordinal, chunk.section, chunk.overlapLength])).toEqual([
      [0, 'Background', 0],
      [1, 'Methods', 0],
    ]);
  });

  it('splits a long paragraph into balanced chunks that overlap by two sentences', () => {
    const chunks = chunkDocument(abstract({ paragraphs: [sentences(45)] }), options);
    expect(chunks.map((chunk) => chunk.tokenCount)).toEqual([230, 240]);
    const [first, second] = chunks as [ChunkDraft, ChunkDraft];
    const repeated = second.text.slice(0, second.overlapLength).trim();
    expect(repeated.split('. ')).toHaveLength(2);
    expect(first.text.endsWith(repeated)).toBe(true);
  });

  it('ends a chunk at a paragraph break rather than inside a paragraph that still fits', () => {
    const chunks = chunkDocument(
      abstract({ paragraphs: [sentences(25), sentences(20, 'controls')] }),
      options,
    );
    expect(chunks.map((chunk) => chunk.text.slice(chunk.overlapLength).trim())).toEqual([
      sentences(25),
      sentences(20, 'controls'),
    ]);
  });

  it('does not repeat a sentence that would crowd out new text', () => {
    const long = `${'Word '.repeat(150).trim()}.`;
    const chunks = chunkDocument(abstract({ paragraphs: [`${long} ${long} ${long}`] }), options);
    expect(chunks.map((chunk) => [chunk.tokenCount, chunk.overlapLength])).toEqual([
      [300, 0],
      [150, 0],
    ]);
  });

  it('splits a sentence longer than the limit between words', () => {
    const chunks = chunkDocument(
      abstract({ paragraphs: [`${'Dose '.repeat(500).trim()}.`] }),
      options,
    );
    expect(chunks.map((chunk) => chunk.tokenCount)).toEqual([400, 100]);
  });

  it('starts a new chunk where a bilingual abstract changes language', () => {
    const chunks = chunkDocument(abstract({ paragraphs: [DE, EN] }), options);
    expect(chunks.map((chunk) => [chunk.language, chunk.text, chunk.overlapLength])).toEqual([
      ['de', DE, 0],
      ['en', EN, 0],
    ]);
  });

  it('gives an unclear paragraph the language of its neighbours over the declared one', () => {
    const document = { ...abstract({ paragraphs: ['Was ist neu?', EN] }), language: 'de' };
    expect(chunkDocument(document, options).map((chunk) => chunk.language)).toEqual(['en']);
  });

  it('falls back to the declared language, or none, when no paragraph is clear', () => {
    const unclear = abstract({ paragraphs: ['Rivaroxaban 15 mg'] });
    expect(chunkDocument({ ...unclear, language: 'de' }, options)[0]?.language).toBe('de');
    expect(chunkDocument(unclear, options)[0]).not.toHaveProperty('language');
  });

  it('does not put the title in front of a metadata chunk, which is the title', () => {
    const document = abstract({ paragraphs: ['Rivaroxaban dosing'], origin: 'metadata' });
    expect(chunkDocument(document, options)[0]?.embeddingText).toBe('Rivaroxaban dosing');
  });

  it('records the licence of full-text chunks', () => {
    const licenseUrl = 'https://creativecommons.org/licenses/by/4.0/';
    const document = abstract({
      label: 'Discussion',
      paragraphs: [EN],
      origin: 'fulltext',
      source: 'europepmc',
      licenseUrl,
    });
    expect(chunkDocument(document, options)[0]).toMatchObject({
      origin: 'fulltext',
      source: 'europepmc',
      licenseUrl,
    });
  });

  it('skips empty paragraphs and returns nothing for an empty document', () => {
    expect(chunkDocument(abstract({ paragraphs: ['', '  '] }), options)).toEqual([]);
  });
});

describe('chunkDocument properties', () => {
  const word = fc.constantFrom('the', 'dose', 'Herz', 'risk', 'und', 'patients', 'p<0.05', 'Dr.');
  const sentence = fc
    .array(word, { minLength: 1, maxLength: 25 })
    .map((words) => `${words.join(' ')}.`);
  const paragraph = fc.array(sentence, { minLength: 1, maxLength: 6 }).map((s) => s.join(' '));
  const section = fc.record({
    label: fc.option(fc.constantFrom('Background', 'Results'), { nil: undefined }),
    paragraphs: fc.array(paragraph, { maxLength: 4 }),
  });
  const document = fc.array(section, { maxLength: 4 }).map((sections) =>
    abstract(
      ...sections.map(({ label, paragraphs }) => ({
        ...(label !== undefined && { label }),
        paragraphs,
      })),
    ),
  );
  const small = { countTokens: countWords, maxTokens: 30, minTokens: 15, overlapMaxTokens: 12 };
  const words = (text: string) => text.split(/\s+/).filter((part) => part !== '');

  it('never loses or duplicates text, ignoring overlap', () => {
    fc.assert(
      fc.property(document, (doc) => {
        const fresh = chunkDocument(doc, small).flatMap((chunk) =>
          words(chunk.text.slice(chunk.overlapLength)),
        );
        const input = doc.sections.flatMap((s) => s.paragraphs.flatMap((p) => words(p)));
        expect(fresh).toEqual(input);
      }),
    );
  });

  it('keeps every chunk within the limit, numbered in order, overlapping only its predecessor', () => {
    fc.assert(
      fc.property(document, (doc) => {
        const chunks = chunkDocument(doc, small);
        for (const [index, chunk] of chunks.entries()) {
          expect(chunk.ordinal).toBe(index);
          expect(chunk.tokenCount).toBeLessThanOrEqual(small.maxTokens);
          const repeated = chunk.text.slice(0, chunk.overlapLength).trim();
          if (repeated !== '') expect(chunks[index - 1]?.text.endsWith(repeated)).toBe(true);
        }
      }),
    );
  });
});
