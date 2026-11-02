import { z } from 'zod';
import type { GoldenGroup } from './golden-set.js';
import type { GoldenSummary } from './run-golden.js';

/** Drops smaller than this are float noise; the search is deterministic otherwise. */
const NOISE = 0.0005;
const METRICS = ['recall', 'mrr', 'ndcg'] as const;

/** Golden scores on one corpus, committed so a change that lowers them fails (SM-08). */
export interface GoldenBaseline {
  readonly golden: number;
  /** The eval index the scores were measured on; scores on another corpus do not compare. */
  readonly corpus: { readonly articleCount: number; readonly chunkCount: number };
  readonly overall: GoldenSummary;
  readonly byGroup: Readonly<Record<GoldenGroup, GoldenSummary>>;
}

const summarySchema = z.object({
  queries: z.number().int(),
  recall: z.number(),
  mrr: z.number(),
  ndcg: z.number(),
});

export const goldenBaselineSchema = z.object({
  golden: z.number().int(),
  corpus: z.object({ articleCount: z.number().int(), chunkCount: z.number().int() }),
  overall: summarySchema,
  byGroup: z.object({ de: summarySchema, en: summarySchema, cross: summarySchema }),
});

export interface Regression {
  readonly scope: 'overall' | GoldenGroup;
  readonly metric: (typeof METRICS)[number];
  readonly baseline: number;
  readonly current: number;
}

export type Comparison =
  | { readonly comparable: false; readonly reason: string }
  | { readonly comparable: true; readonly regressions: readonly Regression[] };

/** Lists every overall and per-group score below the baseline. */
export function compareWithBaseline(baseline: GoldenBaseline, current: GoldenBaseline): Comparison {
  if (baseline.golden !== current.golden) {
    return {
      comparable: false,
      reason: `the baseline is for golden set version ${String(baseline.golden)}, not ${String(current.golden)}`,
    };
  }
  const { articleCount, chunkCount } = current.corpus;
  if (baseline.corpus.articleCount !== articleCount || baseline.corpus.chunkCount !== chunkCount) {
    return { comparable: false, reason: 'the baseline was measured on another eval index' };
  }
  const scopes = [
    ['overall', baseline.overall, current.overall],
    ...(Object.keys(baseline.byGroup) as GoldenGroup[]).map(
      (group) => [group, baseline.byGroup[group], current.byGroup[group]] as const,
    ),
  ] as const;
  const regressions = scopes.flatMap(([scope, before, after]) =>
    METRICS.filter((metric) => after[metric] < before[metric] - NOISE).map(
      (metric): Regression => ({
        scope,
        metric,
        baseline: before[metric],
        current: after[metric],
      }),
    ),
  );
  return { comparable: true, regressions };
}
