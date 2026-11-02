import { isAppError } from '@scholarly-mcp/core';
import type { SearchResult, SearchService } from '@scholarly-mcp/search';
import type { BenchCase } from './bench-cases.js';
import { summarizeLatencies, type LatencySummary } from './summarize-latencies.js';

/** What one bench case returned on its first round. */
export interface CaseOutcome {
  readonly benchCase: BenchCase;
  readonly result?: SearchResult;
  readonly errorCode?: string;
}

/** Latencies over every round, overall and per group, plus each case's first answer. */
export interface BenchReport {
  readonly overall: LatencySummary;
  readonly byGroup: Readonly<Record<string, LatencySummary>>;
  readonly outcomes: readonly CaseOutcome[];
}

export interface BenchOptions {
  readonly rounds: number;
  /** A monotonic clock in milliseconds, such as `performance.now`. */
  readonly now: () => number;
}

/**
 * Runs every case `rounds` times, one search at a time, timing each search end to end. A
 * failed search is timed too and its error code recorded, so a slow failure still counts.
 */
export async function runBench(
  service: SearchService,
  cases: readonly BenchCase[],
  { rounds, now }: BenchOptions,
  signal: AbortSignal,
): Promise<BenchReport> {
  const samples = new Map<string, number[]>();
  const outcomes: CaseOutcome[] = [];
  for (let round = 0; round < rounds; round += 1) {
    for (const benchCase of cases) {
      const started = now();
      const outcome = await service.search(benchCase.request, signal).then(
        (result): CaseOutcome => ({ benchCase, result }),
        (error: unknown): CaseOutcome => {
          if (signal.aborted) throw error;
          return { benchCase, errorCode: isAppError(error) ? error.code : 'INTERNAL' };
        },
      );
      const group = samples.get(benchCase.group) ?? [];
      group.push(now() - started);
      samples.set(benchCase.group, group);
      if (round === 0) outcomes.push(outcome);
    }
  }
  return {
    overall: summarizeLatencies([...samples.values()].flat()),
    byGroup: Object.fromEntries(
      [...samples].map(([group, latencies]) => [group, summarizeLatencies(latencies)]),
    ),
    outcomes,
  };
}
