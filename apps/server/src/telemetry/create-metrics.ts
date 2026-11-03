import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from '@prometheus-io/client';

/**
 * The server's Prometheus metrics (PLAN.md telemetry). Labels are tool names, codes and
 * routes only: never key ids, which would leak who uses the server and grow without bound,
 * and never query text.
 */
export interface ServerMetrics {
  readonly registry: Registry;
  readonly toolCalls: Counter<'tool' | 'status'>;
  readonly toolDuration: Histogram<'tool'>;
  readonly httpRequests: Counter<'route' | 'status'>;
  readonly authFailures: Counter<'reason'>;
  readonly meterExported: Counter;
  readonly meterExportFailures: Counter;
  readonly meterDropped: Counter;
  readonly meterPending: Gauge;
  readonly indexReady: Gauge;
  readonly inFlight: Gauge;
  readonly landingPages: Counter<'session'>;
  readonly landingVisits: Counter<'tool'>;
  readonly landingActions: Counter<'action'>;
}

/** Creates a fresh registry, so tests and several apps in one process never collide. */
export function createMetrics(options: { readonly defaults?: boolean } = {}): ServerMetrics {
  const registry = new Registry();
  if (options.defaults ?? true) collectDefaultMetrics({ register: registry });
  const registers = [registry];
  return {
    registry,
    toolCalls: new Counter({
      name: 'mcp_tool_calls_total',
      help: 'Tool calls by tool and outcome (ok or an error code)',
      labelNames: ['tool', 'status'],
      registers,
    }),
    toolDuration: new Histogram({
      name: 'mcp_tool_duration_seconds',
      help: 'Tool call duration',
      labelNames: ['tool'],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
      registers,
    }),
    httpRequests: new Counter({
      name: 'http_requests_total',
      help: 'HTTP requests by route and status code',
      labelNames: ['route', 'status'],
      registers,
    }),
    authFailures: new Counter({
      name: 'auth_failures_total',
      help: 'Refused or failed authentications by OAuth error code',
      labelNames: ['reason'],
      registers,
    }),
    meterExported: new Counter({
      name: 'meter_events_exported_total',
      help: 'Usage events delivered to every sink',
      registers,
    }),
    meterExportFailures: new Counter({
      name: 'meter_export_failures_total',
      help: 'Export passes that failed and will be retried',
      registers,
    }),
    meterDropped: new Counter({
      name: 'meter_events_dropped_total',
      help: 'Usage events that could not be written to the outbox',
      registers,
    }),
    meterPending: new Gauge({
      name: 'meter_outbox_pending',
      help: 'Usage events waiting in the outbox after the last export pass',
      registers,
    }),
    indexReady: new Gauge({
      name: 'index_ready',
      help: '1 when the search index is open',
      registers,
    }),
    inFlight: new Gauge({
      name: 'http_requests_in_flight',
      help: 'HTTP requests being served',
      registers,
    }),
    landingPages: new Counter({
      name: 'landing_pages_total',
      help: 'Landing pages served, by session state (active, unavailable, none, not_found)',
      labelNames: ['session'],
      registers,
    }),
    landingVisits: new Counter({
      name: 'landing_visits_total',
      help: 'Landing visits confirmed by the browser beacon, by the tool that made the link',
      labelNames: ['tool'],
      registers,
    }),
    landingActions: new Counter({
      name: 'landing_actions_total',
      help: 'Access buttons clicked on landing pages (read, sign_in, buy, view_on_publisher, check_access)',
      labelNames: ['action'],
      registers,
    }),
  };
}
