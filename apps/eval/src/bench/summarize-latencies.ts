/** Latency figures in milliseconds, rounded to 0.1 ms. */
export interface LatencySummary {
  readonly count: number;
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
  readonly mean: number;
}

/** Summarises latency samples with nearest-rank percentiles; all zero when there are none. */
export function summarizeLatencies(samples: readonly number[]): LatencySummary {
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = (p: number) => sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
  const mean = sorted.length === 0 ? 0 : sorted.reduce((sum, ms) => sum + ms, 0) / sorted.length;
  return {
    count: sorted.length,
    p50: round(rank(50)),
    p95: round(rank(95)),
    max: round(sorted.at(-1) ?? 0),
    mean: round(mean),
  };
}

function round(ms: number): number {
  return Math.round(ms * 10) / 10;
}
