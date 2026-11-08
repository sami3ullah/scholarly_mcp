import type { CountTokens, Embedder } from '@scholarly-mcp/core';
import { createSemaphore } from './semaphore.js';

/** Runs the model on a batch of already-prefixed texts: one normalised vector per text. */
export type ExtractFeatures = (texts: string[]) => Promise<Float32Array[]>;

export interface EmbedderParts {
  readonly extract: ExtractFeatures;
  readonly countTokens: CountTokens;
  readonly modelVersion: string;
  /** The length every vector must have. */
  readonly dimensions: number;
  /** Put in front of passages and queries, e.g. e5's `passage: ` and `query: `. */
  readonly prefixes: { readonly passage: string; readonly query: string };
  /** Texts per model call during indexing. */
  readonly batchSize: number;
  /** Model calls allowed at once, shared by passages and queries. */
  readonly concurrency: number;
}

/**
 * Builds the `Embedder` around a loaded model. e5 models expect `passage: ` on indexed text and
 * `query: ` on searches (ARCHITECTURE.md "Query pipeline"); bge-m3 expects nothing. Each batch
 * takes its own semaphore slot, so a query can run between the batches of a long indexing call.
 */
export function createEmbedder(parts: EmbedderParts): Embedder {
  const { extract, countTokens, modelVersion, dimensions, prefixes, batchSize, concurrency } =
    parts;
  const semaphore = createSemaphore(concurrency);

  async function run(texts: string[], signal: AbortSignal): Promise<Float32Array[]> {
    const vectors = await semaphore.run(() => extract(texts), signal);
    if (vectors.length !== texts.length || vectors.some((vector) => vector.length !== dimensions)) {
      throw new Error(
        `Model ${modelVersion} returned ${String(vectors.length)} vectors of unexpected size`,
      );
    }
    return vectors;
  }

  return {
    modelVersion,
    dimensions,
    countTokens,
    async embedPassages(texts, signal) {
      signal.throwIfAborted();
      const vectors: Float32Array[] = [];
      for (let start = 0; start < texts.length; start += batchSize) {
        const batch = texts.slice(start, start + batchSize).map((text) => prefixes.passage + text);
        vectors.push(...(await run(batch, signal)));
        signal.throwIfAborted();
      }
      return vectors;
    },
    async embedQuery(text, signal) {
      signal.throwIfAborted();
      const [vector] = await run([prefixes.query + text], signal);
      if (vector === undefined) throw new Error('The model returned no vector');
      return vector;
    },
  };
}
