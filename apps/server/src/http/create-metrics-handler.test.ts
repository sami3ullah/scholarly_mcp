import { describe, expect, it } from 'vitest';
import { createMetrics } from '../telemetry/create-metrics.js';
import { createMetricsHandler } from './create-metrics-handler.js';

describe('createMetricsHandler', () => {
  const handler = createMetricsHandler(createMetrics({ defaults: false }));

  it('serves the Prometheus exposition at /metrics', async () => {
    const response = await handler.fetch(new Request('http://10.0.0.5:9464/metrics'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toContain('http_requests_total');
  });

  it('serves nothing else', async () => {
    expect((await handler.fetch(new Request('http://10.0.0.5:9464/mcp'))).status).toBe(404);
    const write = new Request('http://10.0.0.5:9464/metrics', { method: 'POST' });
    expect((await handler.fetch(write)).status).toBe(405);
  });
});
