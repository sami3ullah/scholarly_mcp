import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace';
import { createFakeClock } from '@scholarly-mcp/testkit';
import { afterEach, describe, expect, it } from 'vitest';
import { createRateLimiter } from '../limits/create-rate-limiter.js';
import { createMetrics } from '../telemetry/create-metrics.js';
import { startTracing } from '../telemetry/create-tracing.js';
import { startHarness, structured, type Harness } from '../testing/server-harness.js';

const QUERY = 'rivaroxaban dosing elderly';

describe('every tool call is metered, limited, counted and traced', () => {
  let harness: Harness | undefined;
  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it('meters successes as billable and failures as not, never with query text', async () => {
    harness = await startHarness();
    await harness.call('search_articles', { query: QUERY });
    await harness.call('get_article', { doi: '10.1055/does-not-exist' });
    await harness.call('search_articles', { query: '' });
    await harness.flushMeter();
    const events = harness.outbox.all();
    expect(events.map(({ tool, status, billable }) => ({ tool, status, billable }))).toEqual([
      { tool: 'search_articles', status: 'ok', billable: true },
      { tool: 'get_article', status: 'NOT_FOUND', billable: false },
      { tool: 'search_articles', status: 'INVALID_INPUT', billable: false },
    ]);
    expect(events[0]).toMatchObject({ apiKeyId: 'local', id: 'event-1' });
    expect(events[0]?.resultCount).toBeGreaterThan(0);
    expect(JSON.stringify(events)).not.toContain('rivaroxaban');
  });

  it('meters an unexpected failure as INTERNAL, not billable', async () => {
    harness = await startHarness({
      overrides: { embedder: { embedQuery: () => Promise.reject(new Error('onnx crashed')) } },
    });
    const result = await harness.call('search_articles', { query: QUERY });
    expect(structured(result)['code']).toBe('INTERNAL');
    await harness.flushMeter();
    expect(harness.outbox.all()[0]).toMatchObject({ status: 'INTERNAL', billable: false });
  });

  it('answers RATE_LIMITED with retryAfter once the bucket is empty, metered as not billable', async () => {
    const clock = createFakeClock(new Date('2026-11-02T10:00:00Z'));
    harness = await startHarness({
      overrides: { limiter: createRateLimiter({ perMinute: 6, burst: 1, clock }) },
    });
    expect((await harness.call('cite', { doi: '10.1055/a-1001' })).isError).not.toBe(true);
    const limited = await harness.call('cite', { doi: '10.1055/a-1001' });
    expect(structured(limited)).toMatchObject({ code: 'RATE_LIMITED', retryAfter: 10 });
    clock.advance(10_000);
    expect((await harness.call('cite', { doi: '10.1055/a-1001' })).isError).not.toBe(true);
    await harness.flushMeter();
    expect(
      harness.outbox.all().map(({ status, billable }) => `${status}:${String(billable)}`),
    ).toEqual(['ok:true', 'RATE_LIMITED:false', 'ok:true']);
  });

  it('counts calls in Prometheus by tool and outcome', async () => {
    const metrics = createMetrics({ defaults: false });
    harness = await startHarness({ overrides: { metrics } });
    await harness.call('search_articles', { query: QUERY });
    await harness.call('get_article', { doi: '10.1055/does-not-exist' });
    const text = await metrics.registry.metrics();
    expect(text).toContain('mcp_tool_calls_total{tool="search_articles",status="ok"} 1');
    expect(text).toContain('mcp_tool_calls_total{tool="get_article",status="NOT_FOUND"} 1');
    expect(text).toContain('mcp_tool_duration_seconds_count{tool="search_articles"} 1');
  });

  it('traces each call with tool, outcome and count, never the query', async () => {
    const exporter = new InMemorySpanExporter();
    const tracing = startTracing({
      serviceName: 'test',
      version: '0.0.0',
      processor: new SimpleSpanProcessor({ exporter }),
    });
    try {
      harness = await startHarness();
      await harness.call('search_articles', { query: QUERY });
      const span = exporter.getFinishedSpans().find(({ name }) => name === 'tool search_articles');
      expect(span?.attributes).toMatchObject({
        'mcp.tool.name': 'search_articles',
        'mcp.tool.status': 'ok',
      });
      expect(JSON.stringify(exporter.getFinishedSpans().map((s) => s.attributes))).not.toContain(
        'rivaroxaban',
      );
    } finally {
      await tracing.shutdown();
    }
  });
});
