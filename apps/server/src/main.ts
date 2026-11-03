#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { parseConfig, type Clock } from '@scholarly-mcp/core';
import { loadOnnxEmbedder } from '@scholarly-mcp/embedder-onnx';
import { createLogger } from '@scholarly-mcp/logger';
import { searchOptionsFrom } from '@scholarly-mcp/search';
import {
  createSqliteApiKeyStore,
  createSqliteSessionStore,
  createSqliteUsageOutbox,
  openIndexReader,
  openRuntimeDatabase,
  sqliteConfigSchema,
} from '@scholarly-mcp/store-sqlite';
import { httpAuthFromConfig } from './auth/http-auth-from-config.js';
import { serverConfigSchema, type ServerConfig } from './config/server-config.js';
import { createApp } from './create-app.js';
import { createHttpHandler, type HttpHandlerDeps } from './http/create-http-handler.js';
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
import { createMetrics } from './telemetry/create-metrics.js';
import { startTracing } from './telemetry/create-tracing.js';
import { MAX_BODY_BYTES, serveHttp, type HttpServer } from './transports/serve-http.js';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const clock: Clock = { now: () => new Date() };

/**
 * The composition root (PLAN.md "Backend conventions"): reads config, creates the real
 * adapters, wires the app and serves it over stdio or Streamable HTTP. `keys …` manages
 * API keys instead. The model and the index are opened at boot; a missing index is retried
 * on every refresh tick, and tools answer `INDEX_UNAVAILABLE` meanwhile.
 */
async function main(): Promise<void> {
  if (process.argv[2] === 'keys') {
    const { RUNTIME_DB_PATH } = parseConfig(sqliteConfigSchema, process.env);
    mkdirSync(dirname(RUNTIME_DB_PATH), { recursive: true });
    const db = openRuntimeDatabase(RUNTIME_DB_PATH);
    try {
      process.exitCode = await runKeysCommand(process.argv.slice(3), {
        keys: createSqliteApiKeyStore(db),
        clock,
        out: (line) => process.stdout.write(`${line}\n`),
      });
    } finally {
      db.close();
    }
    return;
  }
  await serve(parseConfig(serverConfigSchema, process.env));
}

async function serve(config: ServerConfig): Promise<void> {
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
  const index = createLiveIndex(
    () => openIndexReader(config.INDEX_PATH, embedder.modelVersion),
    logger,
  );
  index.refresh();
  mkdirSync(dirname(config.RUNTIME_DB_PATH), { recursive: true });
  const runtimeDb = openRuntimeDatabase(config.RUNTIME_DB_PATH);
  const sessions = createSqliteSessionStore(runtimeDb);
  const outbox = createSqliteUsageOutbox(runtimeDb);

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
    limiter: createRateLimiter({
      perMinute: config.RATE_LIMIT_PER_MINUTE,
      burst: config.RATE_LIMIT_BURST,
      clock,
    }),
    meter,
    eventId: randomUUID,
    metrics,
  });

  const timers = [
    setInterval(() => {
      index.refresh();
      metrics.indexReady.set(index.isReady() ? 1 : 0);
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
    limiter: createRateLimiter({
      perMinute: config.LANDING_RATE_LIMIT_PER_MINUTE,
      burst: config.LANDING_RATE_LIMIT_BURST,
      clock,
    }),
    ...(config.LANDING_API_SECRET !== undefined && { secret: config.LANDING_API_SECRET }),
    metrics,
  });
  const allowedHosts =
    config.HTTP_ALLOWED_HOSTS.length > 0 ? config.HTTP_ALLOWED_HOSTS : LOCAL_HOSTS;
  const startHttp = (mcp?: HttpHandlerDeps['mcp']): Promise<HttpServer> =>
    serveHttp({
      handler: createHttpHandler({
        ...(mcp !== undefined && { mcp }),
        landing,
        auth: httpAuthFromConfig(config, {
          keys: createSqliteApiKeyStore(runtimeDb),
          clock,
          logger: logger.child({ component: 'auth' }),
        }),
        allowedHosts,
        allowedOrigins:
          config.HTTP_ALLOWED_ORIGINS.length > 0 ? config.HTTP_ALLOWED_ORIGINS : LOCAL_HOSTS,
        // The model is loaded before the server listens, so it is always ready here.
        readiness: () => ({ index: index.isReady(), model: true, accepting: !stopping }),
        metrics,
        logger,
      }),
      host: config.HTTP_HOST,
      port: config.HTTP_PORT,
      logger,
      onInFlight: (count) => {
        metrics.inFlight.set(count);
      },
    });

  let stopTransport: () => Promise<unknown>;
  if (config.MCP_TRANSPORT === 'stdio') {
    const handle = serveStdio(factory, {
      onerror: (error) => {
        logger.warn({ reason: error.message }, 'stdio transport error');
      },
    });
    // A second local client may already hold the port; stdio keeps working without HTTP.
    const http = config.HTTP_ALONGSIDE_STDIO
      ? await startHttp().catch((error: unknown) => {
          logger.warn({ err: error }, 'HTTP alongside stdio not started; landing links fail');
          return undefined;
        })
      : undefined;
    stopTransport = async () => {
      await http?.close(config.SHUTDOWN_TIMEOUT_MS);
      await handle.close();
    };
  } else {
    const mcp = createMcpHandler(factory, {
      maxRequestBodySize: MAX_BODY_BYTES,
      onerror: (error) => {
        logger.warn({ reason: error.message }, 'MCP request rejected');
      },
    });
    const http = await startHttp(mcp);
    stopTransport = async () => {
      await http.close(config.SHUTDOWN_TIMEOUT_MS);
      await mcp.close();
    };
  }
  logger.info(
    {
      transport: config.MCP_TRANSPORT,
      auth: config.AUTH_MODE,
      version,
      ready: index.isReady(),
      tracing: tracing !== undefined,
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
          await exporter.stop();
          await meter.flush(AbortSignal.timeout(5000)).catch((error: unknown) => {
            logger.warn({ err: error }, 'Usage events left in the outbox for the next start');
          });
          await tracing?.shutdown();
        } catch (error) {
          logger.error({ err: error }, 'Shutdown failed');
          process.exitCode = 1;
        } finally {
          index.close();
          runtimeDb.close();
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
