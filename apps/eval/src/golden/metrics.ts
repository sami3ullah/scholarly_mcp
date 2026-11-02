/** Results a metric looks at, as one page of search results holds (PLAN.md tool contracts). */
export const CUTOFF = 10;

/** How one query's ranking scored. */
export interface RankingScore {
  /** Relevant articles in the top 10, over all relevant ones capped at 10. */
  readonly recall: number;
  /** One over the rank of the first relevant article in the top 10, else 0. */
  readonly rr: number;
  /** nDCG@10 with gain 2^grade - 1, against the ideal order of every judged article. */
  readonly ndcg: number;
}

/**
 * Scores a ranking of DOIs against graded judgments (1 partially, 2 highly relevant).
 * Articles nobody judged count as not relevant, as is usual for pooled judgments.
 */
export function scoreRanking(
  ranking: readonly string[],
  grades: ReadonlyMap<string, number>,
): RankingScore {
  const top = ranking.slice(0, CUTOFF).map((doi) => grades.get(doi) ?? 0);
  const relevant = [...grades.values()].filter((grade) => grade > 0);
  if (relevant.length === 0) return { recall: 0, rr: 0, ndcg: 0 };

  const found = top.filter((grade) => grade > 0).length;
  const first = top.findIndex((grade) => grade > 0);
  const ideal = dcg([...relevant].sort((a, b) => b - a).slice(0, CUTOFF));
  return {
    recall: found / Math.min(relevant.length, CUTOFF),
    rr: first === -1 ? 0 : 1 / (first + 1),
    ndcg: dcg(top) / ideal,
  };
}

function dcg(grades: readonly number[]): number {
  return grades.reduce((sum, grade, index) => sum + (2 ** grade - 1) / Math.log2(index + 2), 0);
}
