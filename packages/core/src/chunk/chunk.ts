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

/** How far a stored vector's length may stray from 1; float32 rounding stays near 1e-6. */
const UNIT_LENGTH_TOLERANCE = 1e-3;

const isUnitLength = (vector: Float32Array): boolean => {
  let sum = 0;
  for (const value of vector) sum += value * value;
  return Math.abs(Math.sqrt(sum) - 1) <= UNIT_LENGTH_TOLERANCE;
};

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
     * one size only. Unit length, as the embedder normalises it, so stores may rank by
     * Euclidean distance in cosine order (ADR 0040).
     */
    embedding: z
      .instanceof(Float32Array)
      .refine((vector) => vector.length > 0, { message: 'Expected a non-empty embedding' })
      .refine(isUnitLength, { message: 'Expected a unit-length embedding' }),
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
