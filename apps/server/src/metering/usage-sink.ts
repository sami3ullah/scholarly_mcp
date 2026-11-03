import type { UsageEvent } from '@scholarly-mcp/core';

/** Somewhere usage events are delivered: a file, a billing webhook. */
export interface UsageSink {
  readonly name: string;
  /** Delivers a batch, or rejects; a rejected batch is sent again later (at least once). */
  send(events: readonly UsageEvent[], signal: AbortSignal): Promise<void>;
}
