import { z } from 'zod';

/**
 * Tracing is on when `OTEL_EXPORTER_OTLP_ENDPOINT` is set; the OTLP exporter reads it and
 * the other standard `OTEL_EXPORTER_OTLP_*` variables itself (ADR 0031). `METRICS_PORT`
 * moves `/metrics` off the public port to its own listener on `METRICS_HOST`, so a load
 * balancer that forwards the public port cannot expose it.
 */
export const telemetryConfigSchema = z.object({
  METRICS_HOST: z.string().min(1).default('127.0.0.1'),
  METRICS_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
  OTEL_SERVICE_NAME: z.string().min(1).max(100).default('scholarly-mcp'),
});
