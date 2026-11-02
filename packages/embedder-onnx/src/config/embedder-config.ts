import { z } from 'zod';

/**
 * Embedder settings (ADR 0014). The model itself is fixed in code (`MODEL_VERSION`), because
 * changing it means a new index. `EMBEDDER_ALLOW_REMOTE=false` makes a container use only
 * the model baked into its image, so it never downloads at runtime. Keep
 * `EMBEDDER_BATCH_SIZE` at 1: with q8 weights a batch changes its texts' vectors slightly,
 * and on CPU padding makes batches slower, not faster (ADR 0021).
 */
export const embedderConfigSchema = z.object({
  EMBEDDER_CACHE_DIR: z.string().min(1).optional(),
  EMBEDDER_ALLOW_REMOTE: z.stringbool().default(true),
  EMBEDDER_BATCH_SIZE: z.coerce.number().int().min(1).max(256).default(1),
  EMBEDDER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(1),
});

export type EmbedderConfig = z.output<typeof embedderConfigSchema>;
