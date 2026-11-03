import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import {
  computeFunnel,
  parseWireEvent,
  type Clock,
  type FunnelOptions,
  type UsageEvent,
} from '@scholarly-mcp/core';
import { renderFunnelReport } from './render-funnel-report.js';

export interface FunnelCommandDeps {
  readonly publisher: string;
  readonly clock: Clock;
  readonly out: (line: string) => void;
}

const USAGE = `Usage:
  scholarly-mcp funnel --from <usage.jsonl> --out <funnel.html>
                       [--json <funnel.json>] [--since YYYY-MM-DD] [--until YYYY-MM-DD]
                       [--key <api key id>]

--since is inclusive and --until exclusive, both UTC days.`;

/**
 * `scholarly-mcp funnel …`: reads the metering export (JSON lines, ADR 0033) line by line,
 * computes the funnel and writes a self-contained HTML report, and the JSON if asked.
 * Unreadable lines are skipped and counted, so one torn write never loses the report.
 * Returns the exit code.
 */
export async function runFunnelCommand(
  args: readonly string[],
  deps: FunnelCommandDeps,
): Promise<number> {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...args],
      options: {
        from: { type: 'string' },
        out: { type: 'string' },
        json: { type: 'string' },
        since: { type: 'string' },
        until: { type: 'string' },
        key: { type: 'string' },
      },
      strict: true,
    }));
  } catch {
    deps.out(USAGE);
    return 2;
  }
  const since = day(values.since);
  const until = day(values.until);
  if (values.from === undefined || values.out === undefined || since === null || until === null) {
    deps.out(USAGE);
    return 2;
  }
  const filters: FunnelOptions = {
    ...(since !== undefined && { from: since }),
    ...(until !== undefined && { to: until }),
    ...(values.key !== undefined && { apiKeyId: values.key }),
  };

  let read;
  try {
    read = await readEvents(values.from);
  } catch (error) {
    deps.out(
      `Cannot read ${values.from}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
  const funnel = computeFunnel(read.events, filters);
  const html = renderFunnelReport(funnel, {
    publisher: deps.publisher,
    generatedAt: deps.clock.now(),
    filters,
    skippedLines: read.skipped,
  });
  await write(values.out, html);
  if (values.json !== undefined) {
    await write(
      values.json,
      `${JSON.stringify({ filters, skippedLines: read.skipped, ...funnel }, null, 2)}\n`,
    );
  }

  const { totals } = funnel;
  deps.out(
    `${String(funnel.events)} events: ${String(totals.searches)} searches, ${String(totals.cardsShown)} cards shown, ${String(totals.visits)} visits, ${String(totals.actions)} actions.`,
  );
  if (read.skipped > 0) deps.out(`Skipped ${String(read.skipped)} unreadable lines.`);
  deps.out(`Report written to ${values.out}`);
  return 0;
}

async function readEvents(path: string): Promise<{ events: UsageEvent[]; skipped: number }> {
  const events: UsageEvent[] = [];
  let skipped = 0;
  const lines = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim() === '') continue;
    try {
      events.push(parseWireEvent(JSON.parse(line)));
    } catch {
      skipped += 1;
    }
  }
  return { events, skipped };
}

/** A `YYYY-MM-DD` UTC day; undefined when absent, null when malformed. */
function day(value: string | undefined): Date | undefined | null {
  if (value === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function write(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}
