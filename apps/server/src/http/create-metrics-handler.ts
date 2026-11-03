import type { ServerMetrics } from '../telemetry/create-metrics.js';
import { metricsResponse, type HttpHandler } from './create-http-handler.js';

/** The internal listener's only route: `GET /metrics` (ADR 0031, SM-14 image). */
export function createMetricsHandler(metrics: ServerMetrics): HttpHandler {
  return {
    fetch: async (request) => {
      if (new URL(request.url).pathname !== '/metrics') {
        return new Response('Not found', { status: 404 });
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
      }
      return metricsResponse(metrics);
    },
  };
}
