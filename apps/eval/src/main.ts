#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseConfig, storeConfigSchema, type Clock, type IndexReader } from '@scholarly-mcp/core';
import {
  embedderConfigSchema,
  embeddingModelOf,
  loadOnnxEmbedder,
} from '@scholarly-mcp/embedder-onnx';
import { createLogger, loggingConfigSchema } from '@scholarly-mcp/logger';
import {
  createSearchService,
  searchConfigSchema,
  searchOptionsFrom,
  type SearchService,
} from '@scholarly-mcp/search';
import {
  createPool,
  openPostgresIndexReader,
  postgresConfigSchema,
} from '@scholarly-mcp/store-postgres';
import { openIndexReader, sqliteConfigSchema } from '@scholarly-mcp/store-sqlite';
import { benchCases } from './bench/bench-cases.js';
import { formatOutcomes } from './bench/format-outcomes.js';
import { runBench } from './bench/run-bench.js';
import {
  compareWithBaseline,
  goldenBaselineSchema,
  type GoldenBaseline,
} from './golden/compare-baseline.js';
import { formatGolden } from './golden/format-golden.js';
import { goldenSetSchema } from './golden/golden-set.js';
import { runGolden } from './golden/run-golden.js';

const USAGE = `Usage:
  eval bench [--rounds N] [--max-p95 MS] [--show]
  eval golden [--golden FILE] [--min-recall R] [--min-cross-recall R] [--show]
              [--baseline FILE] [--write-baseline FILE] [--rankings FILE]`;
/** The versioned golden set (SM-08), found from this file so any working directory works. */
const GOLDEN_SET = fileURLToPath(
  new URL('../../../packages/testkit/golden/golden-set.json', import.meta.url),
);
/** DOIs looked up by the bench, taken from the index so they exist. */
const DOI_CASES = 3;

/**
 * The composition root of the evaluation tools (PLAN.md "Backend conventions"): opens the
 * live index read-only with the real embedder and search service, as the server will, with
 * the embedding cache off so each search pays for its embedding. `STORE` picks the SQLite
 * file or the live Postgres build (ADR 0034), so both stores are scored the same way.
 * `bench` times every search end to end; exit 1 when p95 is over budget or a search failed.
 * `golden` scores the golden set (recall@10, MRR, nDCG@10). With `--baseline` it exits 1
 * when any score dropped below the committed baseline (run it on the eval index, ADR 0026),
 * otherwise when recall is below the SM-08 targets. Exit 2 is bad usage or a baseline made
 * on another index or golden set. `--rankings FILE` writes each query's top ten DOIs, so
 * the results of a new model can be pooled for judging (SM-16).
 */
async function main(argv: readonly string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      rounds: { type: 'string', default: '5' },
      'max-p95': { type: 'string', default: '500' },
      golden: { type: 'string', default: GOLDEN_SET },
      'min-recall': { type: 'string', default: '0.8' },
      'min-cross-recall': { type: 'string', default: '0.7' },
      baseline: { type: 'string' },
      'write-baseline': { type: 'string' },
      rankings: { type: 'string' },
      show: { type: 'boolean', default: false },
    },
  });
  const command = positionals[0];
  const rounds = Number(values.rounds);
  const maxP95 = Number(values['max-p95']);
  const minRecall = Number(values['min-recall']);
  const minCrossRecall = Number(values['min-cross-recall']);
  const valid =
    command === 'bench'
      ? Number.isInteger(rounds) && rounds >= 1 && maxP95 > 0
      : command === 'golden' && fraction(minRecall) && fraction(minCrossRecall);
  if (!valid || positionals.length !== 1) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }

  const config = parseConfig(
    embedderConfigSchema
      .extend(loggingConfigSchema.shape)
      .extend(storeConfigSchema.shape)
      .extend(sqliteConfigSchema.shape)
      .extend(searchConfigSchema.shape),
    process.env,
  );
  const logger = createLogger({
    name: 'eval',
    level: config.LOG_LEVEL,
    destination: process.stderr,
  });
  const clock: Clock = { now: () => new Date() };
  const signal = new AbortController().signal;
  const { index, close } = await openIndex(config, embeddingModelOf(config).version, signal);
  try {
    const embedder = await loadOnnxEmbedder(config);
    const service = createSearchService({
      reader: index.reader,
      search: index.search,
      embedder,
      clock,
      logger,
      options: { ...searchOptionsFrom(config), cacheSize: 0 },
    });
    if (command === 'golden') {
      const set = goldenSetSchema.parse(JSON.parse(readFileSync(values.golden, 'utf8')));
      const report = await runGolden(service, set, signal);
      if (values.show) process.stdout.write(`${formatGolden(report)}\n`);
      const { version, overall, byGroup } = report;
      const { articleCount, chunkCount } = index.meta();
      const current: GoldenBaseline = {
        golden: version,
        corpus: { articleCount, chunkCount },
        overall,
        byGroup,
      };
      process.stdout.write(`${JSON.stringify(current, null, 2)}\n`);
      if (values.rankings !== undefined) {
        const rankings = {
          golden: version,
          modelVersion: index.meta().modelVersion,
          queries: report.outcomes.map(({ query, ranking }) => ({ id: query.id, ranking })),
        };
        writeFileSync(values.rankings, `${JSON.stringify(rankings, null, 2)}\n`);
      }
      if (values['write-baseline'] !== undefined) {
        writeFileSync(values['write-baseline'], `${JSON.stringify(current, null, 2)}\n`);
      }
      if (values.baseline !== undefined) {
        const baseline = goldenBaselineSchema.parse(
          JSON.parse(readFileSync(values.baseline, 'utf8')),
        );
        const comparison = compareWithBaseline(baseline, current);
        if (!comparison.comparable) {
          process.stderr.write(`Cannot compare: ${comparison.reason}\n`);
          return 2;
        }
        for (const { scope, metric, baseline: before, current: after } of comparison.regressions) {
          process.stderr.write(
            `Regression: ${scope} ${metric} ${String(before)} -> ${String(after)}\n`,
          );
        }
        return comparison.regressions.length === 0 ? 0 : 1;
      }
      return overall.recall >= minRecall && byGroup.cross.recall >= minCrossRecall ? 0 : 1;
    }
    return await bench(service, { rounds, maxP95, show: values.show }, index.meta(), signal);
  } finally {
    await close();
  }
}

/** The live index of the store `STORE` picks, and how to let go of it. */
async function openIndex(
  config: { readonly STORE: 'sqlite' | 'postgres'; readonly INDEX_PATH: string },
  modelVersion: string,
  signal: AbortSignal,
): Promise<{ readonly index: IndexReader; readonly close: () => Promise<void> }> {
  if (config.STORE === 'sqlite') {
    const index = await openIndexReader(config.INDEX_PATH, modelVersion, signal);
    return { index, close: () => index.close() };
  }
  const postgres = parseConfig(postgresConfigSchema, process.env);
  const pool = createPool({
    url: postgres.DATABASE_URL,
    max: 2,
    statementTimeoutMs: postgres.PG_STATEMENT_TIMEOUT_MS,
    applicationName: 'scholarly-mcp-eval',
  });
  try {
    const index = await openPostgresIndexReader(pool, modelVersion, signal);
    return {
      index,
      close: async () => {
        await index.close();
        await pool.end();
      },
    };
  } catch (error) {
    await pool.end();
    throw error;
  }
}

async function bench(
  service: SearchService,
  options: { rounds: number; maxP95: number; show: boolean },
  meta: unknown,
  signal: AbortSignal,
): Promise<number> {
  const { rounds, maxP95, show } = options;
  const sample = await service.search(
    { query: 'atrial fibrillation', filters: {}, limit: DOI_CASES },
    signal,
  );
  const dois = sample.hits.map(({ article }) => article.doi);
  const report = await runBench(
    service,
    benchCases(dois),
    { rounds, now: () => performance.now() },
    signal,
  );

  if (show) process.stdout.write(`${formatOutcomes(report.outcomes)}\n`);
  const { overall, byGroup, outcomes } = report;
  const failures = outcomes.filter(
    ({ errorCode }) => errorCode !== undefined && errorCode !== 'INVALID_INPUT',
  );
  const summary = {
    index: meta,
    rounds,
    cases: outcomes.length,
    emptyResults: outcomes.filter(({ result }) => result?.hits.length === 0).length,
    failures: failures.map(({ benchCase, errorCode }) => ({ group: benchCase.group, errorCode })),
    overall,
    byGroup,
    maxP95,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  return overall.p95 <= maxP95 && failures.length === 0 ? 0 : 1;
}

function fraction(value: number): boolean {
  return value >= 0 && value <= 1;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  },
);
