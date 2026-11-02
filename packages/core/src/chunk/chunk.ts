import { z } from 'zod';
import { doiSchema } from '../article/doi.js';
import { languageSchema } from '../article/language.js';

/**
 * Where a chunk's text came from. Only `metadata` and `abstract` text may ever be shown;
 * `fulltext` is for matching only (ADR 0003).
 */
export const chunkOriginSchema = z.enum(['metadata', 'abstract', 'fulltext']);

export type ChunkOrigin = z.infer<typeof chunkOriginSchema>;

/** The content source a chunk's text came from, so it can be purged by source. */
export const chunkSourceSchema = z.enum(['crossref', 'europepmc']);

export type ChunkSource = z.infer<typeof chunkSourceSchema>;

/**
 * A passage of an article, the unit of retrieval. Each chunk records its source and licence
 * so it can be purged by either with one query.
 */
export const chunkSchema = z
  .object({
    id: z.string().min(1),
    doi: doiSchema,
    ordinal: z.int().nonnegative(),
    section: z.string().min(1).optional(),
    text: z.string().min(1),
    language: languageSchema.optional(),
    tokenCount: z.int().positive(),
    origin: chunkOriginSchema,
    source: chunkSourceSchema,
    licenseUrl: z.url().optional(),
    /**
     * The model decides the size (ADR 0028); the embedder checks it, and an index holds
     * one size only.
     */
    embedding: z
      .instanceof(Float32Array)
      .refine((vector) => vector.length > 0, { message: 'Expected a non-empty embedding' }),
    modelVersion: z.string().min(1),
  })
  .refine((chunk) => chunk.origin !== 'fulltext' || chunk.licenseUrl !== undefined, {
    message: 'Full-text chunks must record their licence',
    path: ['licenseUrl'],
  });

export type Chunk = z.infer<typeof chunkSchema>;

/** True when a chunk's text may be shown to a reader; full text never is (ADR 0003). */
export function isDisplayable(chunk: Pick<Chunk, 'origin'>): boolean {
  return chunk.origin !== 'fulltext';
}
