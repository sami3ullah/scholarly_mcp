import { createHmac } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { UsageEvent } from '@scholarly-mcp/core';
import {
  createFakeClock,
  createInMemoryUsageOutbox,
  createTestLogger,
  type CapturedLine,
} from '@scholarly-mcp/testkit';
import { describe, expect, it, vi } from 'vitest';
import { createJsonlSink } from './create-jsonl-sink.js';
import { createOutboxMeter } from './create-outbox-meter.js';
import { createUsageExporter, type UsageExporterDeps } from './create-usage-exporter.js';
import { createWebhookSink, SIGNATURE_HEADER, TIMESTAMP_HEADER } from './create-webhook-sink.js';
import type { UsageSink } from './usage-sink.js';

const signal = new AbortController().signal;

function anEvent(id: string, minute = 0): UsageEvent {
  return {
    kind: 'tool_call',
    id,
    tool: 'search_articles',
    resultCount: 3,
    latencyMs: 40,
    status: 'ok',
    billable: true,
    cardsByJournal: [{ journal: 'Pneumologie', cards: 3 }],
    occurredAt: new Date(Date.UTC(2026, 10, 3, 10, minute)),
  };
}

function recordingSink(name = 'memory'): UsageSink & { batches: string[][]; failNext: number } {
  const sink = {
    name,
    batches: [] as string[][],
    failNext: 0,
    send: (events: readonly UsageEvent[]) => {
      if (sink.failNext > 0) {
        sink.failNext -= 1;
        return Promise.reject(new Error(`${name} down`));
      }
      sink.batches.push(events.map(({ id }) => id));
      return Promise.resolve();
    },
  };
  return sink;
}

function exporterWith(sinks: UsageSink[], extra: Partial<UsageExporterDeps> = {}) {
  const outbox = createInMemoryUsageOutbox();
  const clock = createFakeClock(new Date('2026-11-03T12:00:00Z'));
  const exporter = createUsageExporter({
    outbox,
    sinks,
    clock,
    logger: createTestLogger(),
    batchSize: 2,
    intervalMs: 1000,
    backoffMaxMs: 60_000,
    retentionDays: 30,
    random: () => 0.5,
    ...extra,
  });
  return { outbox, clock, exporter };
}

describe('createUsageExporter', () => {
  it('exports every pending event in batches, oldest first, and marks them', async () => {
    const sink = recordingSink();
    const { outbox, exporter } = exporterWith([sink]);
    for (const [index, id] of ['a', 'b', 'c'].entries())
      await outbox.append(anEvent(id, index), signal);
    expect(await exporter.exportPending(signal)).toBe(3);
    expect(sink.batches).toEqual([['a', 'b'], ['c']]);
    expect(await outbox.countPending(signal)).toBe(0);
  });

  it('keeps a batch pending until every sink took it, then resends it (at least once)', async () => {
    const file = recordingSink('file');
    const webhook = recordingSink('webhook');
    webhook.failNext = 1;
    const { outbox, exporter } = exporterWith([file, webhook]);
    await outbox.append(anEvent('a'), signal);
    await expect(exporter.exportPending(signal)).rejects.toThrow('webhook down');
    expect(await outbox.countPending(signal)).toBe(1);
    await exporter.exportPending(signal);
    expect(file.batches).toEqual([['a'], ['a']]);
    expect(webhook.batches).toEqual([['a']]);
    expect(await outbox.countPending(signal)).toBe(0);
  });

  it('backs off exponentially with jitter up to the cap, and resets on success', async () => {
    vi.useFakeTimers();
    try {
      const sink = recordingSink();
      sink.failNext = 10;
      const passes: boolean[] = [];
      const { outbox, exporter } = exporterWith([sink], {
        onPass: ({ failed }) => passes.push(failed),
      });
      await outbox.append(anEvent('a'), signal);
      exporter.start();
      const delays: number[] = [];
      for (let pass = 0; pass < 8; pass += 1) {
        delays.push(exporter.nextDelayMs());
        await vi.advanceTimersByTimeAsync(exporter.nextDelayMs());
      }
      // 1 s, then half of 2, 4, 8 ... s (jitter 0.5, never below the interval), capped at 60 s.
      expect(delays).toEqual([1000, 1000, 2000, 4000, 8000, 16_000, 30_000, 30_000]);
      sink.failNext = 0;
      await vi.advanceTimersByTimeAsync(exporter.nextDelayMs());
      expect(passes.at(-1)).toBe(false);
      expect(exporter.nextDelayMs()).toBe(1000);
      await exporter.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('never runs two passes at once, so a flush during a timed pass sends nothing twice', async () => {
    let release = () => {};
    const sent: string[][] = [];
    const slow: UsageSink = {
      name: 'slow',
      send: async (events) => {
        sent.push(events.map(({ id }) => id));
        if (sent.length === 1) await new Promise<void>((resolve) => (release = resolve));
      },
    };
    const { outbox, exporter } = exporterWith([slow], { batchSize: 10 });
    await outbox.append(anEvent('a'), signal);
    const first = exporter.exportPending(signal);
    const second = exporter.exportPending(signal);
    await new Promise((resolve) => setTimeout(resolve, 10));
    release();
    expect([await first, await second]).toEqual([1, 0]);
    expect(sent).toEqual([['a']]);
  });

  it('lets two exporters share an outbox without sending a batch twice', async () => {
    const first = recordingSink('first');
    const second = recordingSink('second');
    const { outbox, clock, exporter } = exporterWith([first], { batchSize: 10 });
    const other = createUsageExporter({
      outbox,
      sinks: [second],
      clock,
      logger: createTestLogger(),
      batchSize: 10,
      intervalMs: 1000,
      backoffMaxMs: 60_000,
      retentionDays: 30,
    });
    for (const [index, id] of ['a', 'b', 'c'].entries())
      await outbox.append(anEvent(id, index), signal);
    const counts = await Promise.all([exporter.exportPending(signal), other.exportPending(signal)]);
    expect(counts.reduce((sum, n) => sum + n, 0)).toBe(3);
    expect([...first.batches.flat(), ...second.batches.flat()].sort()).toEqual(['a', 'b', 'c']);
  });

  it('deletes exported events past the retention, never pending ones', async () => {
    const { outbox, clock, exporter } = exporterWith([recordingSink()], { retentionDays: 1 });
    await outbox.append(anEvent('old'), signal);
    await outbox.markExported(['old'], new Date(clock.now().getTime() - 2 * 86_400_000), signal);
    await outbox.append(anEvent('new', 1), signal);
    await outbox.append(anEvent('stuck', 2), signal);
    await exporter.exportPending(signal);
    expect(outbox.all().map(({ id }) => id)).toEqual(['new', 'stuck']);
  });
});

describe('createOutboxMeter', () => {
  it('records without waiting and flushes writes in flight before exporting', async () => {
    const outbox = createInMemoryUsageOutbox();
    let exportedAfter = -1;
    const meter = createOutboxMeter({
      outbox,
      exporter: {
        exportPending: async () => {
          exportedAfter = outbox.all().length;
          return Promise.resolve(0);
        },
      },
      logger: createTestLogger(),
    });
    meter.record(anEvent('a'));
    meter.record(anEvent('b'));
    await meter.flush(signal);
    expect(exportedAfter).toBe(2);
  });

  it('never throws when the outbox fails; it logs and counts the dropped event', async () => {
    const logs: CapturedLine[] = [];
    let dropped = 0;
    const meter = createOutboxMeter({
      outbox: { append: () => Promise.reject(new Error('disk full')) },
      exporter: { exportPending: () => Promise.resolve(0) },
      logger: createTestLogger(logs),
      onDropped: () => (dropped += 1),
    });
    expect(() => {
      meter.record(anEvent('a'));
    }).not.toThrow();
    await meter.flush(signal);
    expect(dropped).toBe(1);
    expect(logs.at(-1)).toMatchObject({ level: 'error', message: 'Usage event not stored' });
  });
});

describe('createJsonlSink', () => {
  it('appends one JSON object per event, creating the folder', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'usage-')), 'nested', 'usage.jsonl');
    const sink = createJsonlSink(path);
    await sink.send([anEvent('a')], signal);
    await sink.send([anEvent('b', 1)], signal);
    const lines = readFileSync(path, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as unknown);
    expect(lines).toEqual([
      expect.objectContaining({ id: 'a', occurredAt: '2026-11-03T10:00:00.000Z', billable: true }),
      expect.objectContaining({ id: 'b' }),
    ]);
  });
});

describe('createWebhookSink', () => {
  const clock = createFakeClock(new Date('2026-11-03T12:00:00Z'));
  const secret = 's'.repeat(32);

  it('POSTs the batch with an idempotency key and an HMAC of timestamp and body', async () => {
    const seen: Request[] = [];
    const sink = createWebhookSink({
      url: 'https://billing.example.org/usage',
      secret,
      timeoutMs: 1000,
      clock,
      fetch: (url, init) => {
        seen.push(new Request(url, init));
        return Promise.resolve(new Response(null, { status: 202 }));
      },
    });
    await sink.send([anEvent('a'), anEvent('b')], signal);
    const request = seen[0];
    if (request === undefined) throw new Error('no request');
    const body = await request.text();
    const timestamp = request.headers.get(TIMESTAMP_HEADER);
    expect(timestamp).toBe(String(Date.parse('2026-11-03T12:00:00Z') / 1000));
    const expected = createHmac('sha256', secret)
      .update(`${String(timestamp)}.${body}`)
      .digest('hex');
    expect(request.headers.get(SIGNATURE_HEADER)).toBe(`sha256=${expected}`);
    expect(request.headers.get('idempotency-key')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((JSON.parse(body) as { events: { id: string }[] }).events.map(({ id }) => id)).toEqual([
      'a',
      'b',
    ]);
  });

  it('rejects on a non-2xx answer and on a timeout, so the batch is retried', async () => {
    const failing = createWebhookSink({
      url: 'https://billing.example.org/usage',
      timeoutMs: 1000,
      clock,
      fetch: () => Promise.resolve(new Response('no', { status: 503 })),
    });
    await expect(failing.send([anEvent('a')], signal)).rejects.toThrow('HTTP 503');
    const hanging = createWebhookSink({
      url: 'https://billing.example.org/usage',
      timeoutMs: 20,
      clock,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason as Error);
          });
        }),
    });
    await expect(hanging.send([anEvent('a')], signal)).rejects.toThrow();
  });
});
