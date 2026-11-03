import type { UsageEvent } from '@scholarly-mcp/core';

/** Somewhere usage events are delivered: a file, a billing webhook. */
export interface UsageSink {
  readonly name: string;
  /** Delivers a batch, or rejects; a rejected batch is sent again later (at least once). */
  send(events: readonly UsageEvent[], signal: AbortSignal): Promise<void>;
}

/** An event as sinks write it: plain JSON, ISO timestamps, `id` as the idempotency key. */
export function toWireEvent(event: UsageEvent) {
  return {
    id: event.id,
    apiKeyId: event.apiKeyId,
    tool: event.tool,
    resultCount: event.resultCount,
    latencyMs: event.latencyMs,
    status: event.status,
    billable: event.billable,
    occurredAt: event.occurredAt.toISOString(),
  };
}
