#!/usr/bin/env node
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { parseConfig, type Clock } from '@scholarly-mcp/core';
import { loadOnnxEmbedder } from '@scholarly-mcp/embedder-onnx';
import { createLogger } from '@scholarly-mcp/logger';
import { searchOptionsFrom } from '@scholarly-mcp/search';
import {
  createSqliteSessionStore,
  openIndexReader,
  openRuntimeDatabase,
} from '@scholarly-mcp/store-sqlite';
import { serverConfigSchema } from './config/server-config.js';
import { createApp } from './create-app.js';
import { createLiveIndex } from './runtime/live-index.js';
import { createNodeRandomToken } from './runtime/node-random-token.js';
import { serveHttp } from './transports/serve-http.js';

/**
 * The composition root (PLAN.md "Backend conventions"): reads config, creates the real
 * adapters, wires the app and serves it over stdio or Streamable HTTP. The model and the
 * index are opened at boot; a missing index is retried on every refresh tick, and tools
 * answer `INDEX_UNAVAILABLE` meanwhile. SIGINT and SIGTERM close everything.
 */
async function main(): Promise<void> {
  const config = parseConfig(serverConfigSchema, process.env);
  // On stdio, stdout carries the protocol, so logs go to stderr.
  const logger = createLogger({
    name: 'server',
    level: config.LOG_LEVEL,
    ...(config.MCP_TRANSPORT === 'stdio' && { destination: process.stderr }),
  });
  const clock: Clock = { now: () => new Date() };
  const version = (
    JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    }
  ).version;

  const embedder = await loadOnnxEmbedder(config);
  const index = createLiveIndex(
    () => openIndexReader(config.INDEX_PATH, embedder.modelVersion),
    logger,
  );
  index.refresh();
  mkdirSync(dirname(config.RUNTIME_DB_PATH), { recursive: true });
  const runtimeDb = openRuntimeDatabase(config.RUNTIME_DB_PATH);
  const sessions = createSqliteSessionStore(runtimeDb);

  const factory = createApp({
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
  });

  const timers = [
    setInterval(() => {
      index.refresh();
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

  const transport =
    config.MCP_TRANSPORT === 'stdio'
      ? serveStdio(factory, {
          onerror: (error) => {
            logger.warn({ reason: error.message }, 'stdio transport error');
          },
        })
      : await serveHttp({ factory, host: config.HTTP_HOST, port: config.HTTP_PORT, logger });
  logger.info(
    { transport: config.MCP_TRANSPORT, version, ready: index.isReady() },
    'Server started',
  );

  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      if (stopping) return;
      stopping = true;
      logger.info({ signal }, 'Stopping');
      for (const timer of timers) clearInterval(timer);
      transport
        .close()
        .finally(() => {
          index.close();
          runtimeDb.close();
        })
        .catch((error: unknown) => {
          logger.error({ err: error }, 'Shutdown failed');
          process.exitCode = 1;
        });
    });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
