#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { parseConfig, type Clock } from '@scholarly-mcp/core';
import {
  MODEL_VERSION,
  embedderConfigSchema,
  loadOnnxEmbedder,
} from '@scholarly-mcp/embedder-onnx';
import { createLogger, loggingConfigSchema } from '@scholarly-mcp/logger';
import { createSearchService, searchConfigSchema, searchOptionsFrom } from '@scholarly-mcp/search';
import { openIndexReader, sqliteConfigSchema } from '@scholarly-mcp/store-sqlite';
import { benchCases } from './bench/bench-cases.js';
import { formatOutcomes } from './bench/format-outcomes.js';
import { runBench } from './bench/run-bench.js';

const USAGE = 'Usage: eval bench [--rounds N] [--max-p95 MS] [--show]';
/** DOIs looked up by the bench, taken from the index so they exist. */
const DOI_CASES = 3;

/**
 * The composition root of the evaluation tools (PLAN.md "Backend conventions"): opens the
 * live index read-only with the real embedder and search service, as the server will.
 * `bench` times every search end to end with the embedding cache off, so each search pays
 * for its embedding. Exit codes: 0 within budget, 1 over it or failed, 2 bad usage.
 */
async function main(argv: readonly string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      rounds: { type: 'string', default: '5' },
      'max-p95': { type: 'string', default: '500' },
      show: { type: 'boolean', default: false },
    },
  });
  const rounds = Number(values.rounds);
  const maxP95 = Number(values['max-p95']);
  if (positionals[0] !== 'bench' || !Number.isInteger(rounds) || rounds < 1 || !(maxP95 > 0)) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }

  const config = parseConfig(
    embedderConfigSchema
      .extend(loggingConfigSchema.shape)
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
  const index = openIndexReader(config.INDEX_PATH, MODEL_VERSION);
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

    if (values.show) process.stdout.write(`${formatOutcomes(report.outcomes)}\n`);
    const { overall, byGroup, outcomes } = report;
    const failures = outcomes.filter(
      ({ errorCode }) => errorCode !== undefined && errorCode !== 'INVALID_INPUT',
    );
    const summary = {
      index: index.meta(),
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
  } finally {
    index.close();
  }
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
