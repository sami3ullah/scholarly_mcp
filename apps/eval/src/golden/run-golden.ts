import type { SearchService } from '@scholarly-mcp/search';
import { GOLDEN_GROUPS, type GoldenGroup, type GoldenQuery, type GoldenSet } from './golden-set.js';
import { CUTOFF, scoreRanking, type RankingScore } from './metrics.js';

/** How one golden query did. */
export interface QueryOutcome {
  readonly query: GoldenQuery;
  readonly ranking: readonly string[];
  readonly score: RankingScore;
}

/** Mean scores over the queries that have at least one relevant article. */
export interface GoldenSummary {
  readonly queries: number;
  readonly recall: number;
  readonly mrr: number;
  readonly ndcg: number;
}

export interface GoldenReport {
  readonly version: number;
  readonly overall: GoldenSummary;
  readonly byGroup: Readonly<Record<GoldenGroup, GoldenSummary>>;
  readonly outcomes: readonly QueryOutcome[];
}

/**
 * Runs every golden query through the search service, one page of ten without filters, as
 * an assistant's first call would, and scores the DOIs it returns.
 */
export async function runGolden(
  service: Pick<SearchService, 'search'>,
  set: GoldenSet,
  signal: AbortSignal,
): Promise<GoldenReport> {
  const outcomes: QueryOutcome[] = [];
  for (const query of set.queries) {
    const result = await service.search({ query: query.query, filters: {}, limit: CUTOFF }, signal);
    const ranking = result.hits.map(({ article }) => article.doi);
    const grades = new Map(query.relevant.map(({ doi, grade }) => [doi, grade]));
    outcomes.push({ query, ranking, score: scoreRanking(ranking, grades) });
  }
  return {
    version: set.version,
    overall: summarize(outcomes),
    byGroup: Object.fromEntries(
      GOLDEN_GROUPS.map((group) => [
        group,
        summarize(outcomes.filter(({ query }) => query.group === group)),
      ]),
    ) as Record<GoldenGroup, GoldenSummary>,
    outcomes,
  };
}

function summarize(outcomes: readonly QueryOutcome[]): GoldenSummary {
  const judged = outcomes.filter(({ query }) => query.relevant.length > 0);
  const mean = (pick: (score: RankingScore) => number) =>
    judged.length === 0
      ? 0
      : round(judged.reduce((sum, { score }) => sum + pick(score), 0) / judged.length);
  return {
    queries: judged.length,
    recall: mean(({ recall }) => recall),
    mrr: mean(({ rr }) => rr),
    ndcg: mean(({ ndcg }) => ndcg),
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
