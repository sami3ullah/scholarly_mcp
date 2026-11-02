#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseConfig, type Clock } from '@scholarly-mcp/core';
import {
  MODEL_VERSION,
  embedderConfigSchema,
  loadOnnxEmbedder,
} from '@scholarly-mcp/embedder-onnx';
import { createLogger, loggingConfigSchema } from '@scholarly-mcp/logger';
import { createCrossrefSource, crossrefConfigSchema } from '@scholarly-mcp/source-crossref';
import { sqliteConfigSchema } from '@scholarly-mcp/store-sqlite';
import { ingestConfigSchema } from './config/ingest-config.js';
import { ingestIndex, verifyLiveIndex } from './ingest-index.js';

const USAGE = 'Usage: ingest <full|incremental|verify>';

/**
 * The composition root (PLAN.md "Backend conventions"): reads config, creates the real
 * adapters and runs one command. Exit codes: 0 done, 1 failed or not verified, 2 bad usage.
 * SIGINT and SIGTERM abort the run; its build file is kept and the next run resumes it.
 */
async function main(argv: readonly string[]): Promise<number> {
  const command = argv[0];
  const config = parseConfig(
    crossrefConfigSchema
      .extend(embedderConfigSchema.shape)
      .extend(loggingConfigSchema.shape)
      .extend(sqliteConfigSchema.shape)
      .extend(ingestConfigSchema.shape),
    process.env,
  );
  const logger = createLogger({ name: 'ingest', level: config.LOG_LEVEL });
  const clock: Clock = { now: () => new Date() };
  const controller = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      logger.warn({ signal }, 'Stopping; the build is kept and resumes on the next run');
      controller.abort();
    });
  }

  if (command === 'verify') {
    const report = await verifyLiveIndex(config.INDEX_PATH, MODEL_VERSION, controller.signal);
    logger.info({ ...report }, report.ok ? 'Index verified' : 'Index failed verification');
    return report.ok ? 0 : 1;
  }
  if (command !== 'full' && command !== 'incremental') {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }

  mkdirSync(dirname(config.INDEX_PATH), { recursive: true });
  const outcome = await ingestIndex(
    command,
    {
      indexPath: config.INDEX_PATH,
      fullRunDays: config.INGEST_FULL_RUN_DAYS,
      source: createCrossrefSource({ config, clock, logger }),
      loadEmbedder: () => loadOnnxEmbedder(config),
      clock,
      logger,
    },
    controller.signal,
  );
  const { plan, report, verify, committed } = outcome;
  logger.info(
    { plan, report, verify },
    committed ? 'Index swapped in' : 'Index failed verification; the live index is unchanged',
  );
  return committed ? 0 : 1;
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
