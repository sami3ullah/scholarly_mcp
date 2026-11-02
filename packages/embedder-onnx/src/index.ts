export { embedderConfigSchema, type EmbedderConfig } from './config/embedder-config.js';
export { createEmbedder, type EmbedderParts, type ExtractFeatures } from './create-embedder.js';
export { loadOnnxEmbedder } from './load-onnx-embedder.js';
export {
  DEFAULT_EMBEDDING_MODEL,
  EMBEDDING_MODELS,
  embeddingModelOf,
  type EmbeddingModel,
  type EmbeddingModelName,
  type Pooling,
} from './model.js';
