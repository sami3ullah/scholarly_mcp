import type { GoldenReport } from './run-golden.js';

/**
 * Formats each golden query's scores for a person to read, worst recall first, with the
 * grade of each of its top ten results (2, 1, or . for not relevant or unjudged). The golden
 * queries are synthetic, so printing them is safe.
 */
export function formatGolden({ outcomes }: GoldenReport): string {
  return [...outcomes]
    .sort((a, b) => a.score.recall - b.score.recall || a.score.ndcg - b.score.ndcg)
    .map(({ query, ranking, score }) => {
      const grades = new Map(query.relevant.map(({ doi, grade }) => [doi, grade]));
      const marks = ranking.map((doi) => String(grades.get(doi) ?? '.')).join('');
      const figures = [score.recall, score.rr, score.ndcg].map((n) => n.toFixed(2)).join(' ');
      return `${query.id.padEnd(6)} ${figures}  ${marks.padEnd(10)}  ${query.query}`;
    })
    .join('\n');
}
