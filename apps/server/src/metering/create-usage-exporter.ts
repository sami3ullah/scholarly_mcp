import type { Clock, Logger, UsageOutbox } from '@scholarly-mcp/core';
import type { UsageSink } from './usage-sink.js';

const DAY_MS = 86_400_000;
const PRUNE_EVERY_MS = 3_600_000;

export interface UsageExporterDeps {
  readonly outbox: UsageOutbox;
  readonly sinks: readonly UsageSink[];
  readonly clock: Clock;
  readonly logger: Logger;
  readonly batchSize: number;
  readonly intervalMs: number;
  readonly backoffMaxMs: number;
  readonly retentionDays: number;
  /** Jitter source in [0, 1); injected so backoff tests are deterministic. */
  readonly random?: () => number;
  /** Told after each pass, for metrics. */
  readonly onPass?: (pass: { exported: number; failed: boolean; pending: number }) => void;
}

/** Moves events from the outbox to the sinks, on a timer and on demand. */
export interface UsageExporter {
  /** Starts the timer; the first pass runs after one interval. */
  start(): void;
  /** Stops the timer and waits for a running pass. */
  stop(): Promise<void>;
  /** Exports everything pending now; rejects when a sink fails. Never runs two passes at once. */
  exportPending(signal: AbortSignal): Promise<number>;
  /** The delay before the next timed pass, for tests and logs. */
  nextDelayMs(): number;
}

/**
 * The metering exporter (PLAN.md: exporter down → events wait and retry with backoff).
 * Each batch goes to every sink and is marked exported only when all of them took it, so
 * delivery is at least once and receivers dedupe on the event id. Failures back off
 * exponentially with full jitter up to `backoffMaxMs`; nothing here ever blocks a request.
 * Exported events older than the retention are deleted, at most once an hour.
 */
export function createUsageExporter(deps: UsageExporterDeps): UsageExporter {
  const random = deps.random ?? Math.random;
  let failures = 0;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<number> | undefined;
  let stopped = true;
  let lastPrune = 0;

  const pass = async (signal: AbortSignal): Promise<number> => {
    let exported = 0;
    for (;;) {
      signal.throwIfAborted();
      const batch = await deps.outbox.pending(deps.batchSize, signal);
      if (batch.length === 0) break;
      for (const sink of deps.sinks) await sink.send(batch, signal);
      await deps.outbox.markExported(
        batch.map(({ id }) => id),
        deps.clock.now(),
        signal,
      );
      exported += batch.length;
      if (batch.length < deps.batchSize) break;
    }
    const now = deps.clock.now().getTime();
    if (now - lastPrune >= PRUNE_EVERY_MS) {
      lastPrune = now;
      const removed = await deps.outbox.deleteExported(
        new Date(now - deps.retentionDays * DAY_MS),
        signal,
      );
      if (removed > 0) deps.logger.info({ removed }, 'Old usage events deleted');
    }
    return exported;
  };

  const exportPending = (signal: AbortSignal): Promise<number> => {
    // A pass already running covers this request too; wait for it, then run once more.
    const previous = running ?? Promise.resolve(0);
    const next = previous
      .catch(() => 0)
      .then(() => pass(signal))
      .finally(() => {
        if (running === next) running = undefined;
      });
    running = next;
    return next;
  };

  const nextDelayMs = () => {
    if (failures === 0) return deps.intervalMs;
    const ceiling = Math.min(deps.backoffMaxMs, deps.intervalMs * 2 ** failures);
    return Math.max(deps.intervalMs, Math.round(ceiling * random()));
  };

  const tick = async () => {
    const signal = AbortSignal.timeout(Math.max(deps.backoffMaxMs, 60_000));
    let exported = 0;
    let failed = false;
    try {
      exported = await exportPending(signal);
      if (failures > 0) deps.logger.info({ failures }, 'Usage export recovered');
      failures = 0;
    } catch (error) {
      failed = true;
      failures = Math.min(failures + 1, 30);
      deps.logger.warn(
        { err: error, failures, retryInMs: nextDelayMs() },
        'Usage export failed; events stay in the outbox',
      );
    }
    const pending = await deps.outbox.countPending(signal).catch(() => -1);
    deps.onPass?.({ exported, failed, pending });
  };

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(() => {
      void tick().finally(schedule);
    }, nextDelayMs());
    timer.unref();
  };

  return {
    start: () => {
      if (!stopped) return;
      stopped = false;
      schedule();
    },
    stop: async () => {
      stopped = true;
      clearTimeout(timer);
      await running?.catch(() => 0);
    },
    exportPending,
    nextDelayMs,
  };
}
