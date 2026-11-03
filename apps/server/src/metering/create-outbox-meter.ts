import type { Logger, Meter, UsageOutbox } from '@scholarly-mcp/core';
import type { UsageExporter } from './create-usage-exporter.js';

export interface OutboxMeterDeps {
  readonly outbox: Pick<UsageOutbox, 'append'>;
  readonly exporter: Pick<UsageExporter, 'exportPending'>;
  readonly logger: Logger;
  /** Told when an event could not be stored, for metrics. */
  readonly onDropped?: () => void;
}

/**
 * The `Meter` the tool layer records into. `record` starts the outbox write and returns at
 * once; a failed write is logged and counted, never thrown, so metering cannot fail or
 * slow a request. `flush` waits for the writes in flight and exports what is pending
 * (on SIGTERM); whatever it cannot export stays in the outbox for the next start.
 */
export function createOutboxMeter(deps: OutboxMeterDeps): Meter {
  const writes = new Set<Promise<void>>();
  return {
    record: (event) => {
      const write = deps.outbox
        .append(event, AbortSignal.timeout(5000))
        .catch((error: unknown) => {
          deps.logger.error({ err: error, tool: event.tool }, 'Usage event not stored');
          deps.onDropped?.();
        })
        .finally(() => writes.delete(write));
      writes.add(write);
    },
    flush: async (signal) => {
      await Promise.all(writes);
      await deps.exporter.exportPending(signal);
    },
  };
}
