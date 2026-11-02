import { pipeline } from '@huggingface/transformers';
import { EMBEDDING_DIMENSIONS, type Embedder } from '@scholarly-mcp/core';
import type { EmbedderConfig } from './config/embedder-config.js';
import { createEmbedder, type ExtractFeatures } from './create-embedder.js';
import { MODEL_DTYPE, MODEL_ID, MODEL_REVISION, MODEL_VERSION } from './model.js';

/**
 * Loads multilingual-e5-small through transformers.js and ONNX Runtime on the CPU, then runs
 * one warm-up embedding, so the returned promise resolving means the embedder is ready.
 * Readiness checks wait on it. Inputs longer than the model's 512 tokens are truncated.
 */
export async function loadOnnxEmbedder(config: EmbedderConfig): Promise<Embedder> {
  let extractor;
  try {
    extractor = await pipeline('feature-extraction', MODEL_ID, {
      dtype: MODEL_DTYPE,
      revision: MODEL_REVISION,
      local_files_only: !config.EMBEDDER_ALLOW_REMOTE,
      ...(config.EMBEDDER_CACHE_DIR !== undefined && { cache_dir: config.EMBEDDER_CACHE_DIR }),
    });
  } catch (cause) {
    const where = config.EMBEDDER_ALLOW_REMOTE
      ? ''
      : ' from the local model cache (EMBEDDER_ALLOW_REMOTE=false)';
    throw new Error(`Could not load embedding model ${MODEL_VERSION}${where}`, { cause });
  }

  const extract: ExtractFeatures = async (texts) => {
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    const data = output.data as Float32Array;
    return texts.map((_, index) =>
      data.slice(index * EMBEDDING_DIMENSIONS, (index + 1) * EMBEDDING_DIMENSIONS),
    );
  };
  await extract(['query: warm-up']);

  return createEmbedder({
    extract,
    countTokens: (text) => extractor.tokenizer.encode(text, { add_special_tokens: false }).length,
    modelVersion: MODEL_VERSION,
    batchSize: config.EMBEDDER_BATCH_SIZE,
    concurrency: config.EMBEDDER_CONCURRENCY,
  });
}
