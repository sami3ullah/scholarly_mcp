import type { CaseOutcome } from './run-bench.js';

/** How many results per case `--show` prints. */
const SHOWN = 3;

/**
 * Formats each case's first answer for a person to eyeball: the query, then its top results
 * with their match labels. The bench queries are synthetic, so printing them is safe.
 */
export function formatOutcomes(outcomes: readonly CaseOutcome[]): string {
  return outcomes
    .map(({ benchCase: { group, request }, result, errorCode }) => {
      const head = `[${group}] ${request.query.slice(0, 80)} ${JSON.stringify(request.filters)}`;
      if (result === undefined) return `${head}\n  error ${errorCode ?? 'unknown'}`;
      if (result.hits.length === 0) return `${head}\n  (no results)`;
      const lines = result.hits
        .slice(0, SHOWN)
        .map(
          ({ article, whyMatched }) =>
            `  ${article.doi}  ${article.title.slice(0, 90)}\n      ${whyMatched}`,
        );
      return [head, ...lines].join('\n');
    })
    .join('\n');
}
