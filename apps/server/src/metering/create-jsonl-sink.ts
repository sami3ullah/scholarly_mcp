import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { toWireEvent } from '@scholarly-mcp/core';
import type { UsageSink } from './usage-sink.js';

/**
 * Appends one JSON object per line. A batch retried after a later sink failed is written
 * again, so readers dedupe on `id`.
 */
export function createJsonlSink(path: string): UsageSink {
  let ready: Promise<unknown> | undefined;
  return {
    name: 'jsonl',
    send: async (events, signal) => {
      ready ??= mkdir(dirname(path), { recursive: true });
      await ready;
      signal.throwIfAborted();
      const lines = events.map((event) => `${JSON.stringify(toWireEvent(event))}\n`).join('');
      await appendFile(path, lines, 'utf8');
    },
  };
}
