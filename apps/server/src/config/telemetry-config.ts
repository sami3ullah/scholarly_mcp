import { z } from 'zod';

/**
 * Tracing is on when `OTEL_EXPORTER_OTLP_ENDPOINT` is set; the OTLP exporter reads it and
 * the other standard `OTEL_EXPORTER_OTLP_*` variables itself (ADR 0031).
 */
export const telemetryConfigSchema = z.object({
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
  OTEL_SERVICE_NAME: z.string().min(1).max(100).default('scholarly-mcp'),
});

export type TelemetryConfig = z.output<typeof telemetryConfigSchema>;
