#!/usr/bin/env node
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fulltextConfigSchema, parseConfig, type Clock } from '@scholarly-mcp/core';
import {
  embedderConfigSchema,
  embeddingModelOf,
  loadOnnxEmbedder,
} from '@scholarly-mcp/embedder-onnx';
import { createLogger, loggingConfigSchema } from '@scholarly-mcp/logger';
import { createCrossrefSource, crossrefConfigSchema } from '@scholarly-mcp/source-crossref';
import { createEuropepmcEnricher, europepmcConfigSchema } from '@scholarly-mcp/source-europepmc';
import { sqliteConfigSchema } from '@scholarly-mcp/store-sqlite';
import { ingestConfigSchema } from './config/ingest-config.js';
import {
  extractSubset,
  ingestIndex,
  purgeLicense,
  reembedIndex,
  verifyLiveIndex,
} from './ingest-index.js';

const USAGE = `Usage:
  ingest full | incremental | verify
  ingest purge-license <licence-url>
  ingest subset --from <index> --dois <file> --out <index>
  ingest reembed --from <index> --out <index>`;

/**
 * The composition root (PLAN.md "Backend conventions"): reads config, creates the real
 * adapters and runs one command. `subset` writes only to its `--out` path, never to
 * `INDEX_PATH`, so it cannot replace the live index by mistake; so does `reembed`, which
 * embeds a copy of an index with `EMBEDDER_MODEL` (ADR 0028). Exit codes: 0 done, 1 failed or not verified, 2 bad usage.
 * SIGINT and SIGTERM abort the run; its build file is kept and the next run resumes it.
 */
async function main(argv: readonly string[]): Promise<number> {
  const command = argv[0];
  const config = parseConfig(
    crossrefConfigSchema
      .extend(embedderConfigSchema.shape)
      .extend(loggingConfigSchema.shape)
      .extend(sqliteConfigSchema.shape)
      .extend(europepmcConfigSchema.shape)
      .extend(fulltextConfigSchema.shape)
      .extend(ingestConfigSchema.shape),
    process.env,
  );
  const logger = createLogger({ name: 'ingest', level: config.LOG_LEVEL });
  const model = embeddingModelOf(config);
  const clock: Clock = { now: () => new Date() };
  const controller = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      logger.warn({ signal }, 'Stopping; the build is kept and resumes on the next run');
      controller.abort();
    });
  }

  if (command === 'verify') {
    const report = await verifyLiveIndex(config.INDEX_PATH, model.version, controller.signal);
    logger.info({ ...report }, report.ok ? 'Index verified' : 'Index failed verification');
    return report.ok ? 0 : 1;
  }
  if (command === 'purge-license') {
    const licenseUrl = argv[1];
    if (licenseUrl === undefined || argv.length !== 2) {
      process.stderr.write(`${USAGE}\n`);
      return 2;
    }
    const outcome = await purgeLicense(
      licenseUrl,
      {
        indexPath: config.INDEX_PATH,
        allowlist: config.FULLTEXT_LICENSE_ALLOWLIST,
        model,
        clock,
        logger,
      },
      controller.signal,
    );
    logger.info(
      { purged: outcome.purged, verify: outcome.verify },
      outcome.committed
        ? 'Index swapped in'
        : 'Purge failed verification; the live index is unchanged',
    );
    return outcome.committed ? 0 : 1;
  }
  if (command === 'subset') {
    const { values } = parseArgs({
      args: argv.slice(1),
      options: {
        from: { type: 'string' },
        dois: { type: 'string' },
        out: { type: 'string' },
      },
    });
    const { from, dois, out } = values;
    if (
      from === undefined ||
      dois === undefined ||
      out === undefined ||
      resolve(from) === resolve(out)
    ) {
      process.stderr.write(`${USAGE}\n`);
      return 2;
    }
    mkdirSync(dirname(out), { recursive: true });
    const outcome = await extractSubset(
      readFileSync(dois, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '' && !line.startsWith('#')),
      { sourcePath: from, indexPath: out, model, clock, logger },
      controller.signal,
    );
    const { written, missing, verify, committed } = outcome;
    logger.info(
      { written, missing, verify },
      committed ? 'Subset index written' : 'Subset failed verification; nothing was written',
    );
    return committed ? 0 : 1;
  }
  if (command === 'reembed') {
    const { values } = parseArgs({
      args: argv.slice(1),
      options: { from: { type: 'string' }, out: { type: 'string' } },
    });
    const { from, out } = values;
    if (from === undefined || out === undefined || resolve(from) === resolve(out)) {
      process.stderr.write(`${USAGE}\n`);
      return 2;
    }
    mkdirSync(dirname(out), { recursive: true });
    const outcome = await reembedIndex(
      { sourcePath: from, indexPath: out, embedder: await loadOnnxEmbedder(config), clock, logger },
      controller.signal,
    );
    const { written, kept, chunks, verify, committed } = outcome;
    logger.info(
      { model: model.version, written, kept, chunks, verify },
      committed ? 'Re-embedded index written' : 'Re-embedded index failed verification',
    );
    return committed ? 0 : 1;
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
      ...(config.EUROPEPMC_ENABLED && {
        enricher: createEuropepmcEnricher({ config, fulltext: config, clock, logger }),
      }),
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
