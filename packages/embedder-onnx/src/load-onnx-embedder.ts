import { pipeline } from '@huggingface/transformers';
import type { Embedder } from '@scholarly-mcp/core';
import type { EmbedderConfig } from './config/embedder-config.js';
import { createEmbedder, type ExtractFeatures } from './create-embedder.js';
import { embeddingModelOf } from './model.js';

/**
 * Loads the model `EMBEDDER_MODEL` names through transformers.js and ONNX Runtime on the
 * CPU, then runs one warm-up embedding, so the returned promise resolving means the embedder
 * is ready. Readiness checks wait on it. Inputs longer than the model reads are truncated.
 */
export async function loadOnnxEmbedder(config: EmbedderConfig): Promise<Embedder> {
  const model = embeddingModelOf(config);
  let extractor;
  try {
    extractor = await pipeline('feature-extraction', model.id, {
      dtype: model.dtype,
      revision: model.revision,
      local_files_only: !config.EMBEDDER_ALLOW_REMOTE,
      ...(config.EMBEDDER_CACHE_DIR !== undefined && { cache_dir: config.EMBEDDER_CACHE_DIR }),
    });
  } catch (cause) {
    const where = config.EMBEDDER_ALLOW_REMOTE
      ? ''
      : ' from the local model cache (EMBEDDER_ALLOW_REMOTE=false)';
    throw new Error(`Could not load embedding model ${model.version}${where}`, { cause });
  }

  const { dimensions } = model;
  const extract: ExtractFeatures = async (texts) => {
    const output = await extractor(texts, { pooling: model.pooling, normalize: true });
    const data = output.data as Float32Array;
    return texts.map((_, index) => data.slice(index * dimensions, (index + 1) * dimensions));
  };
  await extract([`${model.prefixes.query}warm-up`]);

  return createEmbedder({
    extract,
    countTokens: (text) => extractor.tokenizer.encode(text, { add_special_tokens: false }).length,
    modelVersion: model.version,
    dimensions,
    prefixes: model.prefixes,
    batchSize: config.EMBEDDER_BATCH_SIZE,
    concurrency: config.EMBEDDER_CONCURRENCY,
  });
}
