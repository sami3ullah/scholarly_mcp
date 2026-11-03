import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import {
  createFunnelCounter,
  parseWireEvent,
  readUsageEvents,
  type Clock,
  type Funnel,
  type FunnelOptions,
  type Logger,
  type UsageEvent,
  type UsageOutbox,
} from '@scholarly-mcp/core';
import { serveHttp } from '../transports/serve-http.js';
import { createFunnelView } from './create-funnel-view.js';
import { funnelFiltersFrom } from './funnel-filters.js';
import { renderFunnelReport } from './render-funnel-report.js';

/** The events of the store `STORE` picks, for `--store`. */
export interface FunnelStore {
  readonly outbox: Pick<UsageOutbox, 'list'>;
  /** How the report names it, with how long it keeps events. */
  readonly source: string;
  close(): Promise<void>;
}

export interface FunnelCommandDeps {
  readonly publisher: string;
  readonly clock: Clock;
  readonly out: (line: string) => void;
  /** Opens the store; only `--store` calls it, so a file report needs no store config. */
  readonly openStore?: (signal: AbortSignal) => Promise<FunnelStore>;
  /** The live view's log. */
  readonly logger?: Logger;
  /** Resolves when `--serve` should stop (SIGINT, SIGTERM); only `--serve` calls it. */
  readonly untilStopped?: () => Promise<void>;
}

const USAGE = `Usage:
  scholarly-mcp funnel --from <usage.jsonl> --out <funnel.html> [--json <funnel.json>] [filters]
  scholarly-mcp funnel --store --out <funnel.html> [--json <funnel.json>] [filters]
  scholarly-mcp funnel --store --serve [--host 127.0.0.1] [--port 8092] [--refresh 60] [filters]

Filters: [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--key <api key id>]
--since is inclusive and --until exclusive, both UTC days.
--store reads the events in the store STORE picks: the outbox keeps exported events for
METER_RETENTION_DAYS, so it covers recent weeks; the export file covers everything.
--serve renders the report on every request (counts reused for --refresh seconds) and has
no login of its own: keep it on a loopback or private address.`;

const DEFAULT_PORT = 8092;
const DEFAULT_REFRESH_SECONDS = 60;

/**
 * `scholarly-mcp funnel …`: counts the funnel (ADR 0033) over the metering export (JSON
 * lines, read line by line) or the store's events (ADR 0035), and writes a self-contained
 * HTML report, and the JSON if asked, or serves it live. Unreadable export lines are
 * skipped and counted, so one torn write never loses the report. Returns the exit code.
 */
export async function runFunnelCommand(
  args: readonly string[],
  deps: FunnelCommandDeps,
): Promise<number> {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...args],
      options: {
        from: { type: 'string' },
        store: { type: 'boolean' },
        out: { type: 'string' },
        json: { type: 'string' },
        serve: { type: 'boolean' },
        host: { type: 'string' },
        port: { type: 'string' },
        refresh: { type: 'string' },
        since: { type: 'string' },
        until: { type: 'string' },
        key: { type: 'string' },
      },
      strict: true,
    }));
  } catch {
    deps.out(USAGE);
    return 2;
  }
  const filters = funnelFiltersFrom(values);
  const fromStore = values.store === true;
  const serving = values.serve === true;
  const port = integer(values.port, DEFAULT_PORT, 0, 65_535);
  const refresh = integer(values.refresh, DEFAULT_REFRESH_SECONDS, 5, 3600);
  const valid =
    filters !== undefined &&
    port !== undefined &&
    refresh !== undefined &&
    fromStore !== (values.from !== undefined) &&
    (serving
      ? fromStore && values.out === undefined && values.json === undefined
      : values.out !== undefined &&
        values.host === undefined &&
        values.port === undefined &&
        values.refresh === undefined);
  if (!valid) {
    deps.out(USAGE);
    return 2;
  }

  if (!fromStore) {
    let read;
    try {
      read = await readExport(values.from ?? '', filters);
    } catch (error) {
      deps.out(`Cannot read ${values.from ?? ''}: ${message(error)}`);
      return 1;
    }
    await report(read.funnel, values.out ?? '', values.json, deps, {
      filters,
      skippedLines: read.skipped,
      source: `the metering export ${values.from ?? ''}`,
    });
    return 0;
  }

  if (deps.openStore === undefined) throw new Error('funnel --store needs openStore');
  let store;
  try {
    store = await deps.openStore(AbortSignal.timeout(30_000));
  } catch (error) {
    deps.out(`Cannot open the store: ${message(error)}`);
    return 1;
  }
  try {
    if (serving) {
      return await serve(store, filters, values.host ?? '127.0.0.1', port, refresh, deps);
    }
    const counter = createFunnelCounter(filters);
    const signal = AbortSignal.timeout(300_000);
    for await (const event of readUsageEvents(store.outbox, filters, signal)) counter.add(event);
    await report(counter.result(), values.out ?? '', values.json, deps, {
      filters,
      skippedLines: 0,
      source: store.source,
    });
    return 0;
  } finally {
    await store.close();
  }
}

async function report(
  funnel: Funnel,
  out: string,
  json: string | undefined,
  deps: FunnelCommandDeps,
  context: { filters: FunnelOptions; skippedLines: number; source: string },
): Promise<void> {
  const html = renderFunnelReport(funnel, {
    publisher: deps.publisher,
    generatedAt: deps.clock.now(),
    ...context,
  });
  await write(out, html);
  if (json !== undefined) {
    await write(
      json,
      `${JSON.stringify({ filters: context.filters, skippedLines: context.skippedLines, ...funnel }, null, 2)}\n`,
    );
  }
  const { totals } = funnel;
  deps.out(
    `${String(funnel.events)} events: ${String(totals.searches)} searches, ${String(totals.cardsShown)} cards shown, ${String(totals.visits)} visits, ${String(totals.actions)} actions.`,
  );
  if (context.skippedLines > 0) {
    deps.out(`Skipped ${String(context.skippedLines)} unreadable lines.`);
  }
  deps.out(`Report written to ${out}`);
}

/** Serves the live view until `deps.untilStopped` resolves. */
async function serve(
  store: FunnelStore,
  filters: FunnelOptions,
  host: string,
  port: number,
  refreshSeconds: number,
  deps: FunnelCommandDeps,
): Promise<number> {
  if (deps.logger === undefined || deps.untilStopped === undefined) {
    throw new Error('funnel --serve needs a logger and untilStopped');
  }
  const { logger, untilStopped } = deps;
  const stopped = untilStopped();
  const server = await serveHttp({
    handler: createFunnelView({
      outbox: store.outbox,
      publisher: deps.publisher,
      clock: deps.clock,
      logger,
      source: store.source,
      refreshSeconds,
      filters,
    }),
    host,
    port,
    logger,
    name: 'Live funnel',
  });
  const shown = host.includes(':') ? `[${host}]` : host;
  deps.out(`Live funnel at http://${shown}:${String(server.port)}/ (Ctrl+C stops it)`);
  if (!LOOPBACK.has(host)) {
    deps.out(`Warning: ${host} is not a loopback address and the view has no login.`);
  }
  await stopped;
  await server.close(5000);
  return 0;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

/** The funnel over the export, streamed line by line through the counter. */
async function readExport(
  path: string,
  filters: FunnelOptions,
): Promise<{ funnel: Funnel; skipped: number }> {
  const counter = createFunnelCounter(filters);
  let skipped = 0;
  for await (const event of readEvents(path)) {
    if (event === undefined) skipped += 1;
    else counter.add(event);
  }
  return { funnel: counter.result(), skipped };
}

/** Every line of the export as an event, or undefined when it is not one. */
async function* readEvents(path: string): AsyncGenerator<UsageEvent | undefined> {
  const lines = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim() === '') continue;
    let event: UsageEvent | undefined;
    try {
      event = parseWireEvent(JSON.parse(line));
    } catch {
      event = undefined;
    }
    yield event;
  }
}

/** A whole number within bounds; the fallback when absent, undefined when invalid. */
function integer(value: string | undefined, fallback: number, min: number, max: number) {
  if (value === undefined) return fallback;
  const parsed = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  return parsed >= min && parsed <= max ? parsed : undefined;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function write(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}
