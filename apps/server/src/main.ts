#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import {
  parseConfig,
  storeConfigSchema,
  withSecretFiles,
  type Clock,
  type Env,
} from '@scholarly-mcp/core';
import { loadOnnxEmbedder } from '@scholarly-mcp/embedder-onnx';
import { createLogger, loggingConfigSchema } from '@scholarly-mcp/logger';
import { searchOptionsFrom } from '@scholarly-mcp/search';
import { postgresConfigSchema } from '@scholarly-mcp/store-postgres';
import { sqliteConfigSchema, type SqliteConfig } from '@scholarly-mcp/store-sqlite';
import { httpAuthFromConfig } from './auth/http-auth-from-config.js';
import {
  serverConfigSchema,
  serverOwnConfigSchema,
  type ServerConfig,
} from './config/server-config.js';
import { meteringConfigSchema } from './config/metering-config.js';
import { createApp } from './create-app.js';
import { createHttpHandler, type HttpHandlerDeps } from './http/create-http-handler.js';
import { createMetricsHandler } from './http/create-metrics-handler.js';
import { runFunnelCommand } from './funnel/run-funnel-command.js';
import { runKeysCommand } from './keys/run-keys-command.js';
import { createLandingApi } from './landing/create-landing-api.js';
import { createRateLimiter } from './limits/create-rate-limiter.js';
import { createJsonlSink } from './metering/create-jsonl-sink.js';
import { createOutboxMeter } from './metering/create-outbox-meter.js';
import { createUsageExporter } from './metering/create-usage-exporter.js';
import { createWebhookSink } from './metering/create-webhook-sink.js';
import type { UsageSink } from './metering/usage-sink.js';
import { createLiveIndex } from './runtime/live-index.js';
import { createNodeRandomToken } from './runtime/node-random-token.js';
import {
  openFunnelStore,
  openKeyStore,
  openServerStores,
  storeSelectionFrom,
  type StoreSelection,
} from './runtime/open-server-stores.js';
import { createMetrics } from './telemetry/create-metrics.js';
import { startTracing } from './telemetry/create-tracing.js';
import { MAX_BODY_BYTES, serveHttp, type HttpServer } from './transports/serve-http.js';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
/** How often idle rate-limit buckets are forgotten (ADR 0036). */
const BUCKET_SWEEP_MS = 60_000;
const clock: Clock = { now: () => new Date() };
/** Settings that may come from a mounted secret file as `<NAME>_FILE` (SM-14). */
const SECRET_NAMES = ['LANDING_API_SECRET', 'METER_WEBHOOK_SECRET', 'DATABASE_URL'];

/**
 * The composition root (PLAN.md "Backend conventions"): reads config, creates the real
 * adapters, wires the app and serves it over stdio or Streamable HTTP. `keys …` manages
 * API keys and `funnel …` writes the funnel report from the metering export or the store,
 * or serves it live (ADR 0035), instead.
 * `STORE` picks SQLite files or Postgres (ADR 0034). The model and the index are opened at
 * boot; a missing index is retried on every refresh tick, and tools answer
 * `INDEX_UNAVAILABLE` meanwhile.
 */
async function main(): Promise<void> {
  // Resolved once, before anything reads the environment.
  Object.assign(
    process.env,
    withSecretFiles(process.env, SECRET_NAMES, (path) => readFileSync(path, 'utf8')),
  );
  if (process.argv[2] === 'keys') {
    const store = await openKeyStore(
      storeSelectionOf(process.env, parseConfig(sqliteConfigSchema, process.env)),
      AbortSignal.timeout(30_000),
    );
    try {
      process.exitCode = await runKeysCommand(process.argv.slice(3), {
        keys: store.keys,
        clock,
        out: (line) => process.stdout.write(`${line}\n`),
      });
    } finally {
      await store.close();
    }
    return;
  }
  if (process.argv[2] === 'funnel') {
    const { PUBLISHER_NAME } = parseConfig(
      serverOwnConfigSchema.pick({ PUBLISHER_NAME: true }),
      process.env,
    );
    process.exitCode = await runFunnelCommand(process.argv.slice(3), {
      publisher: PUBLISHER_NAME,
      clock,
      out: (line) => process.stdout.write(`${line}\n`),
      openStore: (signal) =>
        openFunnelStore(
          storeSelectionOf(process.env, parseConfig(sqliteConfigSchema, process.env)),
          parseConfig(meteringConfigSchema, process.env).METER_RETENTION_DAYS,
          signal,
        ),
      logger: createLogger({
        name: 'funnel',
        level: parseConfig(loggingConfigSchema, process.env).LOG_LEVEL,
        destination: process.stderr,
      }),
      untilStopped: () =>
        new Promise((resolve) => {
          process.once('SIGINT', resolve);
          process.once('SIGTERM', resolve);
        }),
    });
    return;
  }
  const config = parseConfig(serverConfigSchema, process.env);
  await serve(config, storeSelectionOf(process.env, config));
}

function storeSelectionOf(env: Env, sqlite: SqliteConfig): StoreSelection {
  return storeSelectionFrom(parseConfig(storeConfigSchema, env), sqlite, () =>
    parseConfig(postgresConfigSchema, env),
  );
}

async function serve(config: ServerConfig, selection: StoreSelection): Promise<void> {
  // On stdio, stdout carries the protocol, so logs go to stderr.
  const logger = createLogger({
    name: 'server',
    level: config.LOG_LEVEL,
    ...(config.MCP_TRANSPORT === 'stdio' && { destination: process.stderr }),
  });
  const version = (
    JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    }
  ).version;
  const tracing =
    config.OTEL_EXPORTER_OTLP_ENDPOINT === undefined
      ? undefined
      : startTracing({ serviceName: config.OTEL_SERVICE_NAME, version });
  const metrics = createMetrics();

  const embedder = await loadOnnxEmbedder(config);
  const stores = await openServerStores(
    selection,
    embedder.modelVersion,
    AbortSignal.timeout(30_000),
  );
  const { sessions, outbox } = stores;
  const index = createLiveIndex((signal) => stores.openIndex(signal), logger);
  const toolLimiter = createRateLimiter({
    store: stores.buckets,
    name: 'tools',
    perMinute: config.RATE_LIMIT_PER_MINUTE,
    burst: config.RATE_LIMIT_BURST,
    clock,
    logger,
  });
  const landingLimiter = createRateLimiter({
    store: stores.buckets,
    name: 'landing',
    perMinute: config.LANDING_RATE_LIMIT_PER_MINUTE,
    burst: config.LANDING_RATE_LIMIT_BURST,
    clock,
    logger,
  });
  await index.refresh();

  const sinks: UsageSink[] = [createJsonlSink(config.METER_JSONL_PATH)];
  if (config.METER_WEBHOOK_URL !== undefined) {
    sinks.push(
      createWebhookSink({
        url: config.METER_WEBHOOK_URL,
        ...(config.METER_WEBHOOK_SECRET !== undefined && { secret: config.METER_WEBHOOK_SECRET }),
        timeoutMs: config.METER_WEBHOOK_TIMEOUT_MS,
        clock,
      }),
    );
  }
  const exporter = createUsageExporter({
    outbox,
    sinks,
    clock,
    logger: logger.child({ component: 'meter' }),
    batchSize: config.METER_BATCH_SIZE,
    intervalMs: config.METER_EXPORT_MS,
    backoffMaxMs: config.METER_BACKOFF_MAX_MS,
    retentionDays: config.METER_RETENTION_DAYS,
    onPass: ({ exported, failed, pending }) => {
      metrics.meterExported.inc(exported);
      if (failed) metrics.meterExportFailures.inc();
      if (pending >= 0) metrics.meterPending.set(pending);
    },
  });
  const meter = createOutboxMeter({
    outbox,
    exporter,
    logger: logger.child({ component: 'meter' }),
    onDropped: () => {
      metrics.meterDropped.inc();
    },
  });

  const { factory, landingPages, referrals } = createApp({
    index,
    embedder,
    sessions,
    tokens: createNodeRandomToken(),
    clock,
    logger,
    landingBaseUrl: config.LANDING_BASE_URL,
    publisher: config.PUBLISHER_NAME,
    ...(config.JOURNAL_URL_TEMPLATE !== undefined && {
      journalUrlTemplate: config.JOURNAL_URL_TEMPLATE,
    }),
    searchOptions: searchOptionsFrom(config),
    version,
    limiter: toolLimiter,
    meter,
    eventId: randomUUID,
    metrics,
  });

  const timers = [
    setInterval(() => {
      for (const limiter of [toolLimiter, landingLimiter]) {
        limiter.sweep(AbortSignal.timeout(10_000)).catch((error: unknown) => {
          logger.warn({ err: error }, 'Idle rate-limit buckets not swept');
        });
      }
    }, BUCKET_SWEEP_MS),
    setInterval(() => {
      void index.refresh().then(() => {
        metrics.indexReady.set(index.isReady() ? 1 : 0);
      });
    }, config.INDEX_REFRESH_MS),
    setInterval(() => {
      sessions.deleteExpired(clock.now(), AbortSignal.timeout(10_000)).then(
        (removed) => {
          if (removed > 0) logger.info({ removed }, 'Expired landing sessions deleted');
        },
        (error: unknown) => {
          logger.warn({ err: error }, 'Expired landing sessions not deleted');
        },
      );
    }, config.SESSION_CLEANUP_MS),
  ];
  for (const timer of timers) timer.unref();
  metrics.indexReady.set(index.isReady() ? 1 : 0);
  exporter.start();

  let stopping = false;
  const landing = createLandingApi({
    pages: landingPages,
    referrals,
    limiter: landingLimiter,
    ...(config.LANDING_API_SECRET !== undefined && { secret: config.LANDING_API_SECRET }),
    metrics,
  });
  const allowedHosts =
    config.HTTP_ALLOWED_HOSTS.length > 0 ? config.HTTP_ALLOWED_HOSTS : LOCAL_HOSTS;
  const auth = httpAuthFromConfig(config, {
    keys: stores.keys,
    clock,
    logger: logger.child({ component: 'auth' }),
  });
  const handlerDeps = {
    auth,
    allowedHosts,
    allowedOrigins:
      config.HTTP_ALLOWED_ORIGINS.length > 0 ? config.HTTP_ALLOWED_ORIGINS : LOCAL_HOSTS,
    // The model is loaded before the server listens, so it is always ready here.
    readiness: () => ({ index: index.isReady(), model: true, accepting: !stopping }),
    metrics,
    logger,
  } satisfies Partial<HttpHandlerDeps>;
  const startHttp = (mcp?: HttpHandlerDeps['mcp']): Promise<HttpServer> =>
    serveHttp({
      handler: createHttpHandler({
        ...handlerDeps,
        ...(mcp !== undefined && { mcp }),
        // On its own port the landing API is not served here, so the public port 404s it.
        ...(config.LANDING_API_PORT === undefined && { landing }),
        exposeMetrics: config.METRICS_PORT === undefined,
      }),
      host: config.HTTP_HOST,
      port: config.HTTP_PORT,
      logger,
      onInFlight: (count) => {
        metrics.inFlight.set(count);
      },
    });
  // Only the landing app's network reaches this listener; it serves no `/mcp` or metrics.
  const startLandingHttp = (): Promise<HttpServer | undefined> =>
    config.LANDING_API_PORT === undefined
      ? Promise.resolve(undefined)
      : serveHttp({
          handler: createHttpHandler({ ...handlerDeps, landing, exposeMetrics: false }),
          host: config.LANDING_API_HOST,
          port: config.LANDING_API_PORT,
          logger,
          name: 'landing',
        });

  // Both or neither, so a failed landing listener does not leave the public one open.
  const startBothHttp = async (mcp?: HttpHandlerDeps['mcp']) => {
    const http = await startHttp(mcp);
    try {
      return [http, await startLandingHttp()] as const;
    } catch (error) {
      await http.close(0);
      throw error;
    }
  };

  // Off the public port, so a load balancer that forwards it cannot expose the metrics.
  const metricsHttp =
    config.METRICS_PORT === undefined
      ? undefined
      : await serveHttp({
          handler: createMetricsHandler(metrics),
          host: config.METRICS_HOST,
          port: config.METRICS_PORT,
          logger,
          name: 'metrics',
        });

  let stopTransport: () => Promise<unknown>;
  if (config.MCP_TRANSPORT === 'stdio') {
    const handle = serveStdio(factory, {
      onerror: (error) => {
        logger.warn({ reason: error.message }, 'stdio transport error');
      },
    });
    // A second local client may already hold the port; stdio keeps working without HTTP.
    const [http, landingHttp]: readonly [HttpServer?, (HttpServer | undefined)?] =
      config.HTTP_ALONGSIDE_STDIO
        ? await startBothHttp().catch((error: unknown) => {
            logger.warn({ err: error }, 'HTTP alongside stdio not started; landing links fail');
            return [];
          })
        : [];
    stopTransport = async () => {
      await Promise.all([
        http?.close(config.SHUTDOWN_TIMEOUT_MS),
        landingHttp?.close(config.SHUTDOWN_TIMEOUT_MS),
      ]);
      await handle.close();
    };
  } else {
    const mcp = createMcpHandler(factory, {
      maxRequestBodySize: MAX_BODY_BYTES,
      onerror: (error) => {
        logger.warn({ reason: error.message }, 'MCP request rejected');
      },
    });
    const [http, landingHttp] = await startBothHttp(mcp);
    stopTransport = async () => {
      await Promise.all([
        http.close(config.SHUTDOWN_TIMEOUT_MS),
        landingHttp?.close(config.SHUTDOWN_TIMEOUT_MS),
      ]);
      await mcp.close();
    };
  }
  logger.info(
    {
      transport: config.MCP_TRANSPORT,
      store: selection.store,
      auth: config.AUTH_MODE,
      version,
      ready: index.isReady(),
      tracing: tracing !== undefined,
      metricsPort: metricsHttp?.port,
      landingApiPort: config.LANDING_API_PORT,
    },
    'Server started',
  );

  // SIGTERM (PLAN.md failure modes): stop taking work, drain requests in flight, flush the
  // metering outbox, then close files. Events the flush cannot export stay in the outbox.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      if (stopping) return;
      stopping = true;
      logger.info({ signal }, 'Stopping');
      for (const timer of timers) clearInterval(timer);
      void (async () => {
        try {
          await stopTransport();
          await metricsHttp?.close(config.SHUTDOWN_TIMEOUT_MS);
          await exporter.stop();
          await meter.flush(AbortSignal.timeout(5000)).catch((error: unknown) => {
            logger.warn({ err: error }, 'Usage events left in the outbox for the next start');
          });
          await tracing?.shutdown();
        } catch (error) {
          logger.error({ err: error }, 'Shutdown failed');
          process.exitCode = 1;
        } finally {
          await index.close();
          await stores.close();
          logger.info({ signal }, 'Stopped');
        }
      })();
    });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
