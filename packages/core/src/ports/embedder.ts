import type { CountTokens } from '../chunk/chunk-document.js';

/** Turns text into vectors in-process (key design decision 5). */
export interface Embedder {
  /** Identifies the model; stored per chunk so versions are never mixed in one index. */
  readonly modelVersion: string;
  readonly dimensions: number;
  /**
   * Counts the model tokens of a text, without special tokens, so the chunker can size
   * chunks to what the model reads. Synchronous: the tokenizer is loaded with the model.
   * A function property, so it can be passed to `chunkDocument` on its own.
   */
  readonly countTokens: CountTokens;
  /** Embeds indexable passages, one vector per text, in order. */
  embedPassages(texts: readonly string[], signal: AbortSignal): Promise<Float32Array[]>;
  /** Embeds a search query. */
  embedQuery(text: string, signal: AbortSignal): Promise<Float32Array>;
}
