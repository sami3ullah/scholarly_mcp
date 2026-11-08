import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tokenSchema, toWireEvent, type Funnel, type UsageEvent } from '@scholarly-mcp/core';
import { createInMemoryUsageOutbox, createTestLogger } from '@scholarly-mcp/testkit';
import { afterEach, describe, expect, it } from 'vitest';
import { createJsonlSink } from '../metering/create-jsonl-sink.js';
import { doi, startHarness, structured, type Harness } from '../testing/server-harness.js';
import { runFunnelCommand } from './run-funnel-command.js';

const signal = new AbortController().signal;
const clock = { now: () => new Date('2026-11-03T12:00:00Z') };

function workdir(): string {
  return mkdtempSync(join(tmpdir(), 'funnel-'));
}

async function run(args: string[]) {
  const lines: string[] = [];
  const code = await runFunnelCommand(args, {
    publisher: 'Example Publisher',
    clock,
    out: (line) => lines.push(line),
  });
  return { code, lines };
}

function aCall(id: string, day: string): UsageEvent {
  return {
    kind: 'tool_call',
    id,
    tool: 'search_articles',
    resultCount: 2,
    latencyMs: 5,
    status: 'ok',
    billable: true,
    cardsByJournal: [{ journal: 'Pneumologie', cards: 2 }],
    occurredAt: new Date(`${day}T10:00:00Z`),
  };
}

let harness: Harness | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('scholarly-mcp funnel', () => {
  it('reports exactly the events the server recorded, from search to action', async () => {
    harness = await startHarness();
    const answer = structured(await harness.call('search_articles', { query: 'rivaroxaban' }));
    const cards = answer['cards'] as { url: string; doi: string; journal: string }[];
    await harness.call('cite', { doi: '10.1055/a-1001' });
    const [first] = cards;
    const token = tokenSchema.parse(new URL(first?.url ?? '').searchParams.get('t'));
    const opened = doi(first?.doi ?? '');
    await harness.referrals.record({ kind: 'landing_visit', token, doi: opened }, signal);
    await harness.referrals.record({ kind: 'landing_visit', token, doi: opened }, signal);
    await harness.referrals.record(
      { kind: 'landing_action', token, doi: opened, action: 'read' },
      signal,
    );
    await harness.flushMeter();
    const recorded = harness.outbox.all();

    const dir = workdir();
    const exportFile = join(dir, 'usage.jsonl');
    // The export as the server writes it, delivered twice as at-least-once allows.
    const sink = createJsonlSink(exportFile);
    await sink.send(recorded, signal);
    await sink.send(recorded.slice(0, 2), signal);

    const { code, lines } = await run([
      '--from',
      exportFile,
      '--out',
      join(dir, 'report', 'funnel.html'),
      '--json',
      join(dir, 'funnel.json'),
    ]);
    expect(code).toBe(0);
    const funnel = JSON.parse(readFileSync(join(dir, 'funnel.json'), 'utf8')) as Funnel;
    expect(funnel.totals).toEqual({
      searches: 1,
      cardsShown: cards.length,
      visits: 1,
      actions: 1,
      clickThrough: 1 / cards.length,
    });
    expect(funnel.duplicates).toBe(2);
    expect(funnel.byJournal.find((row) => row.journal === first?.journal)).toMatchObject({
      visits: 1,
      actions: 1,
    });
    expect(lines[0]).toBe(
      `4 events: 1 searches, ${String(cards.length)} cards shown, 1 visits, 1 actions.`,
    );

    const html = readFileSync(join(dir, 'report', 'funnel.html'), 'utf8');
    expect(html).toContain('<title>Referral funnel</title>');
    expect(html).toContain(first?.journal ?? 'missing');
    expect(html).not.toContain('rivaroxaban');
    expect(html).not.toContain(token);
    expect(html).not.toMatch(/<script|src="http|href="http/);
  });

  it('skips and counts lines that are not events', async () => {
    const dir = workdir();
    const event: UsageEvent = {
      kind: 'tool_call',
      id: 'e1',
      tool: 'search_articles',
      resultCount: 2,
      latencyMs: 5,
      status: 'ok',
      billable: true,
      cardsByJournal: [{ journal: 'Pneumologie', cards: 2 }],
      occurredAt: new Date('2026-11-03T10:00:00Z'),
    };
    const file = join(dir, 'usage.jsonl');
    writeFileSync(file, `${JSON.stringify(toWireEvent(event))}\n{"torn":\n\nnot json\n`);
    const { code, lines } = await run(['--from', file, '--out', join(dir, 'f.html')]);
    expect(code).toBe(0);
    expect(lines).toContain('Skipped 2 unreadable lines.');
    expect(readFileSync(join(dir, 'f.html'), 'utf8')).toContain('2 unreadable lines skipped');
  });

  it('filters by day', async () => {
    const dir = workdir();
    const file = join(dir, 'usage.jsonl');
    const at = (day: string, id: string): UsageEvent => ({
      kind: 'tool_call',
      id,
      tool: 'search_articles',
      resultCount: 0,
      latencyMs: 1,
      status: 'ok',
      billable: true,
      cardsByJournal: [],
      occurredAt: new Date(`${day}T10:00:00Z`),
    });
    const events = [at('2026-11-01', '1'), at('2026-11-02', '2'), at('2026-11-03', '3')];
    writeFileSync(file, events.map((e) => `${JSON.stringify(toWireEvent(e))}\n`).join(''));
    const { lines } = await run([
      '--from',
      file,
      '--out',
      join(dir, 'f.html'),
      '--since',
      '2026-11-02',
      '--until',
      '2026-11-03',
    ]);
    expect(lines[0]).toMatch(/^1 events: 1 searches/);
  });

  it.each([
    [['--out', 'x.html']],
    [['--from', 'x.jsonl']],
    [['--from', 'x.jsonl', '--out', 'x.html', '--since', '3 Nov']],
    [['--from', 'x.jsonl', '--out', 'x.html', '--query', 'x']],
    [['--from', 'x.jsonl', '--store', '--out', 'x.html']],
    [['--store']],
    [['--from', 'x.jsonl', '--serve']],
    [['--store', '--serve', '--out', 'x.html']],
    [['--store', '--out', 'x.html', '--port', '8092']],
    [['--store', '--serve', '--refresh', '1']],
    [['--store', '--serve', '--port', 'http']],
  ])('prints usage and exits 2 for %j', async (args) => {
    const { code, lines } = await run(args);
    expect(code).toBe(2);
    expect(lines[0]).toMatch(/^Usage:/);
  });

  it('writes the report from the store, closing it afterwards', async () => {
    const outbox = createInMemoryUsageOutbox();
    await outbox.append(aCall('e1', '2026-11-02'), signal);
    await outbox.append(aCall('e2', '2026-11-03'), signal);
    await outbox.markExported(['e1'], clock.now(), signal);
    let closed = false;
    const dir = workdir();
    const lines: string[] = [];
    const code = await runFunnelCommand(
      ['--store', '--out', join(dir, 'f.html'), '--json', join(dir, 'f.json')],
      {
        publisher: 'Example Publisher',
        clock,
        out: (line) => lines.push(line),
        openStore: () =>
          Promise.resolve({
            outbox,
            source: 'Postgres scholarly.usage_events (exported events kept 30 days)',
            close: () => {
              closed = true;
              return Promise.resolve();
            },
          }),
      },
    );
    expect(code).toBe(0);
    expect(closed).toBe(true);
    expect(lines[0]).toBe('2 events: 2 searches, 4 cards shown, 0 visits, 0 actions.');
    expect(readFileSync(join(dir, 'f.html'), 'utf8')).toContain(
      'come from Postgres scholarly.usage_events',
    );
    expect((JSON.parse(readFileSync(join(dir, 'f.json'), 'utf8')) as Funnel).events).toBe(2);
  });

  it('exits 1 when the store cannot be opened', async () => {
    const lines: string[] = [];
    const code = await runFunnelCommand(['--store', '--out', join(workdir(), 'f.html')], {
      publisher: 'Example Publisher',
      clock,
      out: (line) => lines.push(line),
      openStore: () => Promise.reject(new Error('data/runtime.sqlite does not exist')),
    });
    expect(code).toBe(1);
    expect(lines).toEqual(['Cannot open the store: data/runtime.sqlite does not exist']);
  });

  it('serves the live view until stopped', async () => {
    const outbox = createInMemoryUsageOutbox();
    await outbox.append(aCall('e1', '2026-11-03'), signal);
    let stop: () => void = () => undefined;
    const lines: string[] = [];
    let listening: (line: string) => void = () => undefined;
    const announced = new Promise<string>((resolve) => {
      listening = resolve;
    });
    const running = runFunnelCommand(['--store', '--serve', '--port', '0', '--refresh', '5'], {
      publisher: 'Example Publisher',
      clock,
      out: (line) => {
        lines.push(line);
        if (line.startsWith('Live funnel at')) listening(line);
      },
      logger: createTestLogger(),
      openStore: () => Promise.resolve({ outbox, source: 'test', close: () => Promise.resolve() }),
      untilStopped: () =>
        new Promise<void>((resolve) => {
          stop = resolve;
        }),
    });
    const url = /http:\/\/\S+/.exec(await announced)?.[0] ?? '';
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const response = await fetch(`${url}funnel.json`);
    expect(((await response.json()) as Funnel).totals.searches).toBe(1);
    stop();
    expect(await running).toBe(0);
    expect(lines.some((line) => line.startsWith('Warning'))).toBe(false);
  });

  it('exits 1 when the export cannot be read', async () => {
    const dir = workdir();
    const { code, lines } = await run([
      '--from',
      join(dir, 'missing.jsonl'),
      '--out',
      join(dir, 'f.html'),
    ]);
    expect(code).toBe(1);
    expect(lines[0]).toMatch(/^Cannot read/);
  });
});
