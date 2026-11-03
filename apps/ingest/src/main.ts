#!/usr/bin/env node
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  fulltextConfigSchema,
  parseConfig,
  storeConfigSchema,
  type Clock,
  type IndexStorage,
  type Logger,
} from '@scholarly-mcp/core';
import {
  embedderConfigSchema,
  embeddingModelOf,
  loadOnnxEmbedder,
} from '@scholarly-mcp/embedder-onnx';
import { createLogger, loggingConfigSchema } from '@scholarly-mcp/logger';
import { createCrossrefSource, crossrefConfigSchema } from '@scholarly-mcp/source-crossref';
import { createEuropepmcEnricher, europepmcConfigSchema } from '@scholarly-mcp/source-europepmc';
import {
  assertMigrated,
  createPool,
  createPostgresIndexStorage,
  grantServerRole,
  migrateDatabase,
  postgresConfigSchema,
  type Pool,
  type PostgresConfig,
} from '@scholarly-mcp/store-postgres';
import {
  createSqliteIndexStorage,
  openRuntimeDatabase,
  sqliteConfigSchema,
  type SqliteConfig,
} from '@scholarly-mcp/store-sqlite';
import { ingestConfigSchema } from './config/ingest-config.js';
import {
  copyIndex,
  extractSubset,
  ingestIndex,
  purgeLicense,
  reembedIndex,
  verifyLiveIndex,
} from './ingest-index.js';

/** Longer than any migration should take, short enough not to hang a deploy. */
const MIGRATE_TIMEOUT_MS = 120_000;

const USAGE = `Usage:
  ingest full | incremental | verify | migrate
  ingest purge-license <licence-url>
  ingest copy --from <index>
  ingest subset --from <index> --dois <file> --out <index>
  ingest reembed --from <index> --out <index>`;

/**
 * The composition root (PLAN.md "Backend conventions"): reads config, creates the real
 * adapters and runs one command. `subset` writes only to its `--out` path, never to
 * `INDEX_PATH`, so it cannot replace the live index by mistake; so does `reembed`, which
 * embeds a copy of an index with `EMBEDDER_MODEL` (ADR 0028); both read and write SQLite
 * files whatever `STORE` says. `STORE` picks where the other commands keep the index: the
 * file at `INDEX_PATH`, or Postgres at `DATABASE_URL` as the writer role (ADR 0034).
 * `copy` replaces that live index with a verified copy of a SQLite index file, such as the
 * eval index, so a new store starts without fetching or embedding anything.
 * `migrate` brings the runtime tables up to date and grants `PG_SERVER_ROLE` its access;
 * on Postgres it must run before the server starts. Exit codes: 0 done, 1 failed or not
 * verified, 2 bad usage. SIGINT and SIGTERM abort the run; its build is kept and the next
 * run resumes it.
 */
async function main(argv: readonly string[]): Promise<number> {
  const command = argv[0];
  if (command === 'migrate') {
    if (argv.length !== 1) {
      process.stderr.write(`${USAGE}\n`);
      return 2;
    }
    // Needs only the store settings, so a database can be prepared before anything else.
    const config = parseConfig(
      storeConfigSchema.extend(sqliteConfigSchema.shape).extend(loggingConfigSchema.shape),
      process.env,
    );
    const logger = createLogger({ name: 'ingest', level: config.LOG_LEVEL });
    await migrate(config, logger, AbortSignal.timeout(MIGRATE_TIMEOUT_MS));
    return 0;
  }
  const config = parseConfig(
    crossrefConfigSchema
      .extend(embedderConfigSchema.shape)
      .extend(loggingConfigSchema.shape)
      .extend(storeConfigSchema.shape)
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
    return withStorage(config, controller.signal, async (storage) => {
      const report = await verifyLiveIndex(storage, model.version, controller.signal);
      logger.info({ ...report }, report.ok ? 'Index verified' : 'Index failed verification');
      return report.ok ? 0 : 1;
    });
  }
  if (command === 'purge-license') {
    const licenseUrl = argv[1];
    if (licenseUrl === undefined || argv.length !== 2) {
      process.stderr.write(`${USAGE}\n`);
      return 2;
    }
    return withStorage(config, controller.signal, async (storage) => {
      const outcome = await purgeLicense(
        licenseUrl,
        { storage, allowlist: config.FULLTEXT_LICENSE_ALLOWLIST, model, clock, logger },
        controller.signal,
      );
      logger.info(
        { purged: outcome.purged, verify: outcome.verify },
        outcome.committed
          ? 'Index swapped in'
          : 'Purge failed verification; the live index is unchanged',
      );
      return outcome.committed ? 0 : 1;
    });
  }
  if (command === 'copy') {
    const { values } = parseArgs({ args: argv.slice(1), options: { from: { type: 'string' } } });
    const { from } = values;
    if (
      from === undefined ||
      (config.STORE === 'sqlite' && resolve(from) === resolve(config.INDEX_PATH))
    ) {
      process.stderr.write(`${USAGE}\n`);
      return 2;
    }
    return withStorage(config, controller.signal, async (target) => {
      const outcome = await copyIndex(
        {
          source: createSqliteIndexStorage(from),
          target,
          model,
          sources: [createCrossrefSource({ config, clock, logger }).name],
          clock,
          logger,
        },
        controller.signal,
      );
      const { written, verify, committed } = outcome;
      logger.info(
        { store: config.STORE, written, verify },
        committed
          ? 'Index copied and swapped in'
          : 'Copy failed verification; the live index is unchanged',
      );
      return committed ? 0 : 1;
    });
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
      {
        source: createSqliteIndexStorage(from),
        target: createSqliteIndexStorage(out),
        model,
        clock,
        logger,
      },
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
      {
        source: createSqliteIndexStorage(from),
        target: createSqliteIndexStorage(out),
        embedder: await loadOnnxEmbedder(config),
        clock,
        logger,
      },
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

  return withStorage(config, controller.signal, async (storage) => {
    const outcome = await ingestIndex(
      command,
      {
        storage,
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
  });
}

type StoreSettings = SqliteConfig & { readonly STORE: 'sqlite' | 'postgres' };

/**
 * Runs `work` on the index storage `STORE` picks. Postgres must already be migrated, so a
 * build never starts on a database `ingest migrate` has not prepared.
 */
async function withStorage<T>(
  config: StoreSettings,
  signal: AbortSignal,
  work: (storage: IndexStorage) => Promise<T>,
): Promise<T> {
  if (config.STORE === 'sqlite') {
    mkdirSync(dirname(config.INDEX_PATH), { recursive: true });
    return work(createSqliteIndexStorage(config.INDEX_PATH));
  }
  const postgres = parseConfig(postgresConfigSchema, process.env);
  return withPool(postgres, async (pool) => {
    await assertMigrated(pool, signal);
    return work(
      createPostgresIndexStorage({
        pool,
        ...(postgres.PG_SERVER_ROLE !== undefined && { serverRole: postgres.PG_SERVER_ROLE }),
      }),
    );
  });
}

/** `ingest migrate`: the runtime tables, and on Postgres the server role's grants. */
async function migrate(config: StoreSettings, logger: Logger, signal: AbortSignal): Promise<void> {
  if (config.STORE === 'sqlite') {
    mkdirSync(dirname(config.RUNTIME_DB_PATH), { recursive: true });
    // Opening the runtime file migrates it.
    openRuntimeDatabase(config.RUNTIME_DB_PATH).close();
    logger.info({ store: 'sqlite' }, 'Database migrated');
    return;
  }
  const postgres = parseConfig(postgresConfigSchema, process.env);
  const role = postgres.PG_SERVER_ROLE;
  await withPool(postgres, async (pool) => {
    await migrateDatabase(pool, signal);
    if (role !== undefined) await grantServerRole(pool, role, signal);
  });
  logger.info({ store: 'postgres', serverRole: role }, 'Database migrated');
}

/** A pool on `DATABASE_URL`, closed when `work` is done. */
async function withPool<T>(config: PostgresConfig, work: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = createPool({
    url: config.DATABASE_URL,
    max: config.PG_POOL_MAX,
    statementTimeoutMs: config.PG_STATEMENT_TIMEOUT_MS,
    applicationName: 'scholarly-mcp-ingest',
  });
  try {
    return await work(pool);
  } finally {
    await pool.end();
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
