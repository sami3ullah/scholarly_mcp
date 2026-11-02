import { describe, expect, it } from 'vitest';
import { EMBEDDING_DIMENSIONS, chunkSchema, isDisplayable } from './chunk.js';

const valid = {
  id: '10.1055/a-1#0',
  doi: '10.1055/a-1',
  ordinal: 0,
  section: 'Results',
  text: 'Three patients were diagnosed with cholangiocarcinoma.',
  language: 'en',
  tokenCount: 9,
  origin: 'abstract',
  source: 'crossref',
  embedding: new Float32Array(EMBEDDING_DIMENSIONS),
  modelVersion: 'multilingual-e5-small@1',
};

describe('chunkSchema', () => {
  it('accepts an abstract chunk without a licence', () => {
    expect(chunkSchema.safeParse(valid).success).toBe(true);
  });

  it('requires a licence on full-text chunks so they can be purged by licence', () => {
    const result = chunkSchema.safeParse({ ...valid, origin: 'fulltext', source: 'europepmc' });
    expect(result.error?.issues[0]?.path).toEqual(['licenseUrl']);
  });

  it('accepts a full-text chunk that records its licence', () => {
    const chunk = {
      ...valid,
      origin: 'fulltext',
      source: 'europepmc',
      licenseUrl: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
    };
    expect(chunkSchema.safeParse(chunk).success).toBe(true);
  });

  it('rejects an embedding of the wrong size', () => {
    const result = chunkSchema.safeParse({ ...valid, embedding: new Float32Array(768) });
    expect(result.error?.issues[0]?.message).toBe('Expected 384 dimensions');
  });
});

describe('isDisplayable', () => {
  it.each([
    ['metadata', true],
    ['abstract', true],
    ['fulltext', false],
  ] as const)('returns %s -> %s', (origin, expected) => {
    expect(isDisplayable({ origin })).toBe(expected);
  });
});
