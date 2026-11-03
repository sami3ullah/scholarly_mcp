import type { FunnelOptions } from '@scholarly-mcp/core';

/** The filters as the command line and the live view's query string spell them. */
export interface FunnelFilterText {
  readonly since?: string | undefined;
  readonly until?: string | undefined;
  readonly key?: string | undefined;
}

/**
 * The funnel's filters: `since` inclusive and `until` exclusive, both UTC days
 * (`YYYY-MM-DD`), and an API key id. Undefined when a day is malformed.
 */
export function funnelFiltersFrom(text: FunnelFilterText): FunnelOptions | undefined {
  const since = day(text.since);
  const until = day(text.until);
  if (since === null || until === null) return undefined;
  return {
    ...(since !== undefined && { from: since }),
    ...(until !== undefined && { to: until }),
    ...(text.key !== undefined && text.key !== '' && { apiKeyId: text.key }),
  };
}

/** A `YYYY-MM-DD` UTC day; undefined when absent, null when malformed. */
function day(value: string | undefined): Date | undefined | null {
  if (value === undefined || value === '') return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}
