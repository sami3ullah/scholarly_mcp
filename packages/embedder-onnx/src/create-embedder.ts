import { EMBEDDING_DIMENSIONS, type CountTokens, type Embedder } from '@scholarly-mcp/core';
import { createSemaphore } from './semaphore.js';

/** Runs the model on a batch of already-prefixed texts: one normalised vector per text. */
export type ExtractFeatures = (texts: string[]) => Promise<Float32Array[]>;

export interface EmbedderParts {
  readonly extract: ExtractFeatures;
  readonly countTokens: CountTokens;
  readonly modelVersion: string;
  /** Texts per model call during indexing. */
  readonly batchSize: number;
  /** Model calls allowed at once, shared by passages and queries. */
  readonly concurrency: number;
}

/**
 * Builds the `Embedder` around a loaded model. e5 models expect `passage: ` on indexed text
 * and `query: ` on searches (PLAN.md "Query pipeline"). Each batch takes its own semaphore
 * slot, so a query can run between the batches of a long indexing call.
 */
export function createEmbedder(parts: EmbedderParts): Embedder {
  const { extract, countTokens, modelVersion, batchSize, concurrency } = parts;
  const semaphore = createSemaphore(concurrency);

  async function run(texts: string[], signal: AbortSignal): Promise<Float32Array[]> {
    const vectors = await semaphore.run(() => extract(texts), signal);
    if (
      vectors.length !== texts.length ||
      vectors.some((vector) => vector.length !== EMBEDDING_DIMENSIONS)
    ) {
      throw new Error(
        `Model ${modelVersion} returned ${String(vectors.length)} vectors of unexpected size`,
      );
    }
    return vectors;
  }

  return {
    modelVersion,
    dimensions: EMBEDDING_DIMENSIONS,
    countTokens,
    async embedPassages(texts, signal) {
      signal.throwIfAborted();
      const vectors: Float32Array[] = [];
      for (let start = 0; start < texts.length; start += batchSize) {
        const batch = texts.slice(start, start + batchSize).map((text) => `passage: ${text}`);
        vectors.push(...(await run(batch, signal)));
        signal.throwIfAborted();
      }
      return vectors;
    },
    async embedQuery(text, signal) {
      signal.throwIfAborted();
      const [vector] = await run([`query: ${text}`], signal);
      if (vector === undefined) throw new Error('The model returned no vector');
      return vector;
    },
  };
}
