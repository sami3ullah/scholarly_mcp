import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, TracerProvider, type SpanProcessor } from '@opentelemetry/sdk-trace';

/** A running tracer provider; `shutdown` flushes spans still buffered. */
export interface Tracing {
  shutdown(): Promise<void>;
}

/**
 * Registers OpenTelemetry tracing globally: spans for each HTTP request and tool call,
 * exported over OTLP to `OTEL_EXPORTER_OTLP_ENDPOINT` (ADR 0031). Span attributes name
 * tools, codes and counts, never query text or keys. Without this call the API is a no-op.
 */
export function startTracing(options: {
  readonly serviceName: string;
  readonly version: string;
  /** Replaces the OTLP exporter, for tests. */
  readonly processor?: SpanProcessor;
}): Tracing {
  const contextManager = new AsyncLocalStorageContextManager().enable();
  context.setGlobalContextManager(contextManager);
  const provider = new TracerProvider({
    resource: resourceFromAttributes({
      'service.name': options.serviceName,
      'service.version': options.version,
    }),
    spanProcessors: [
      options.processor ?? new BatchSpanProcessor({ exporter: new OTLPTraceExporter() }),
    ],
  });
  trace.setGlobalTracerProvider(provider);
  return {
    shutdown: async () => {
      await provider.shutdown();
      trace.disable();
      context.disable();
    },
  };
}
