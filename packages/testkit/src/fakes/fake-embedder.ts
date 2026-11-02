import { EMBEDDING_DIMENSIONS, type Embedder } from '@scholarly-mcp/core';
import { settle } from './settle.js';

const WORD = /[\p{L}\p{N}]+/gu;

/** FNV-1a, enough to spread words over the vector deterministically. */
function hash(word: string): number {
  let value = 0x811c9dc5;
  for (const char of word) {
    value ^= char.codePointAt(0) ?? 0;
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

function embed(text: string): Float32Array {
  const vector = new Float32Array(EMBEDDING_DIMENSIONS);
  for (const [word] of text.toLowerCase().matchAll(WORD)) {
    const index = hash(word) % EMBEDDING_DIMENSIONS;
    vector[index] = (vector[index] ?? 0) + 1;
  }
  const norm = Math.hypot(...vector);
  if (norm === 0) vector[0] = 1;
  else for (const [index, value] of vector.entries()) vector[index] = value / norm;
  return vector;
}

/**
 * A deterministic bag-of-words embedder: texts sharing words get similar vectors, so search
 * tests can reason about ranking without loading a model. Counts one token per word.
 */
export function createFakeEmbedder(): Embedder {
  return {
    modelVersion: 'fake-embedder@1',
    dimensions: EMBEDDING_DIMENSIONS,
    countTokens: (text) => text.match(WORD)?.length ?? 0,
    embedPassages: (texts, signal) => settle(signal, () => texts.map(embed)),
    embedQuery: (text, signal) => settle(signal, () => embed(text)),
  };
}
