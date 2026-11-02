import { z } from 'zod';

/**
 * Describes one built index. The server reopens when `version` changes and refuses an index
 * whose `modelVersion` differs from its embedder's.
 */
export const indexMetaSchema = z.object({
  version: z.string().min(1),
  modelVersion: z.string().min(1),
  articleCount: z.int().nonnegative(),
  chunkCount: z.int().nonnegative(),
  builtAt: z.date(),
});

export type IndexMeta = z.infer<typeof indexMetaSchema>;
