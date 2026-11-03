import type { Doi, VectorChunk } from '@scholarly-mcp/core';
import { describe, expect, it } from 'vitest';
import { languageLanes, relatedHits } from './language-lanes.js';

const hit = (id: string, similarity: number): VectorChunk => ({
  chunkId: `${id}#0`,
  doi: id as Doi,
  rank: 1,
  similarity,
});

describe('languageLanes', () => {
  it('splits a search without a language into German and all other passages', () => {
    expect(languageLanes({ yearFrom: 2024 })).toEqual([
      { yearFrom: 2024, language: 'de' },
      { yearFrom: 2024, excludeLanguage: 'de' },
    ]);
  });

  it('keeps one lane when a language is asked for or left out', () => {
    expect(languageLanes({ language: 'en' })).toEqual([{ language: 'en' }]);
    expect(languageLanes({ excludeLanguage: 'de' })).toEqual([{ excludeLanguage: 'de' }]);
  });
});

describe('relatedHits', () => {
  it('keeps the hits of every lane within the margin of the best hit of all lanes', () => {
    const german = [hit('de-1', 0.9), hit('de-2', 0.84)];
    const english = [hit('en-1', 0.87), hit('en-2', 0.8)];
    expect(relatedHits([german, english], 0.05)).toEqual([[german[0]], [english[0]]]);
  });

  it('leaves a lane with nothing related empty', () => {
    const english = [hit('en-1', 0.92)];
    expect(relatedHits([[hit('de-1', 0.83)], english], 0.05)).toEqual([[], english]);
  });

  it('handles lanes without hits', () => {
    expect(relatedHits([[], []], 0.05)).toEqual([[], []]);
  });
});
