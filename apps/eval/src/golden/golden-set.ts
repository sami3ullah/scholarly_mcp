import { z } from 'zod';

export const GOLDEN_GROUPS = ['de', 'en', 'cross'] as const;
export type GoldenGroup = (typeof GOLDEN_GROUPS)[number];

const judgmentSchema = z.object({
  doi: z.string().min(1),
  /** 1 partially relevant, 2 highly relevant; anything else is not relevant. */
  grade: z.union([z.literal(1), z.literal(2)]),
});

const goldenQuerySchema = z.object({
  id: z.string().min(1),
  group: z.enum(GOLDEN_GROUPS),
  query: z.string().min(1),
  /** The information need the judges graded against. */
  need: z.string().min(1),
  relevant: z.array(judgmentSchema),
});

/**
 * The golden set (ADR 0026): queries with graded judgments made from title and abstract only,
 * over candidates pooled from several retrieval runs. Versioned: a change of queries or
 * judgments bumps `version`, as scores across versions do not compare.
 */
export const goldenSetSchema = z.object({
  version: z.number().int().positive(),
  rubric: z.string().min(1),
  queries: z.array(goldenQuerySchema).min(1),
});

export type GoldenSet = z.infer<typeof goldenSetSchema>;
export type GoldenQuery = z.infer<typeof goldenQuerySchema>;
