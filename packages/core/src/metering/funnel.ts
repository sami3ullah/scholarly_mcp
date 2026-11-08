import type { ToolName } from './tool-name.js';
import type { LandingAction, UsageEvent } from './usage-event.js';

/** Which events a funnel covers. `from` is inclusive, `to` exclusive. */
export interface FunnelOptions {
  readonly from?: Date;
  readonly to?: Date;
}

/** The four funnel steps (PLAN.md metering dashboard). */
export interface FunnelSteps {
  /** Successful `search_articles` calls. */
  readonly searches: number;
  /** Cards in successful answers of any card-returning tool. */
  readonly cardsShown: number;
  /** Results opened on the landing page. */
  readonly visits: number;
  /** Access buttons clicked on the landing page. */
  readonly actions: number;
}

export interface FunnelJournalRow {
  readonly journal: string;
  readonly cardsShown: number;
  readonly visits: number;
  readonly actions: number;
  /** Visits per card shown; undefined without cards. */
  readonly clickThrough: number | undefined;
}

export interface FunnelToolRow {
  readonly tool: ToolName | 'unknown';
  /** Successful calls. */
  readonly calls: number;
  readonly failedCalls: number;
  readonly cardsShown: number;
  readonly visits: number;
}

export interface FunnelDayRow extends FunnelSteps {
  /** UTC day, `YYYY-MM-DD`. */
  readonly day: string;
}

/** The funnel over a set of recorded events (ADR 0033). Holds no query text or token. */
export interface Funnel {
  /** The first and last event counted; undefined when none were. */
  readonly period: { readonly first: Date; readonly last: Date } | undefined;
  readonly events: number;
  /** Events dropped because their id was already counted (at-least-once export). */
  readonly duplicates: number;
  readonly totals: FunnelSteps & { readonly clickThrough: number | undefined };
  /** Most cards shown first. */
  readonly byJournal: readonly FunnelJournalRow[];
  readonly byTool: readonly FunnelToolRow[];
  /** Every landing action, most clicked first, zeros included. */
  readonly byAction: readonly { readonly action: LandingAction; readonly count: number }[];
  /** Oldest first, only days with events. */
  readonly byDay: readonly FunnelDayRow[];
}

const ACTIONS: readonly LandingAction[] = [
  'read',
  'sign_in',
  'buy',
  'view_on_publisher',
  'check_access',
];

interface Steps {
  searches: number;
  cardsShown: number;
  visits: number;
  actions: number;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const noSteps = (): Steps => ({ searches: 0, cardsShown: 0, visits: 0, actions: 0 });

/** Counts the funnel one event at a time, so a source can stream its events through it. */
export interface FunnelCounter {
  add(event: UsageEvent): void;
  /** The funnel over the events added so far. */
  result(): Funnel;
}

/**
 * Counts the funnel: searches, then cards shown per journal, then landing visits, then next
 * actions. Events are deduped by id, because exporters deliver at least once. Pure, so the
 * report's numbers can be checked against recorded events.
 */
export function computeFunnel(events: Iterable<UsageEvent>, options: FunnelOptions = {}): Funnel {
  const counter = createFunnelCounter(options);
  for (const event of events) counter.add(event);
  return counter.result();
}

/** The counter behind `computeFunnel`; it keeps every counted id to dedupe. */
export function createFunnelCounter(options: FunnelOptions = {}): FunnelCounter {
  const seen = new Set<string>();
  let duplicates = 0;
  let first: Date | undefined;
  let last: Date | undefined;
  const totals = noSteps();
  const journals = new Map<string, { cardsShown: number; visits: number; actions: number }>();
  const tools = new Map<ToolName | 'unknown', Mutable<Omit<FunnelToolRow, 'tool'>>>();
  const days = new Map<string, Steps>();
  const actions = new Map<LandingAction, number>(ACTIONS.map((action) => [action, 0]));

  const journal = (name: string) =>
    getOrAdd(journals, name, () => ({ cardsShown: 0, visits: 0, actions: 0 }));
  const tool = (name: ToolName | 'unknown') =>
    getOrAdd(tools, name, () => ({ calls: 0, failedCalls: 0, cardsShown: 0, visits: 0 }));
  const bump = (event: UsageEvent, step: keyof Steps, by = 1) => {
    totals[step] += by;
    getOrAdd(days, event.occurredAt.toISOString().slice(0, 10), noSteps)[step] += by;
  };

  const add = (event: UsageEvent) => {
    if (!covers(options, event)) return;
    if (seen.has(event.id)) {
      duplicates += 1;
      return;
    }
    seen.add(event.id);
    if (first === undefined || event.occurredAt < first) first = event.occurredAt;
    if (last === undefined || event.occurredAt > last) last = event.occurredAt;

    switch (event.kind) {
      case 'tool_call': {
        const row = tool(event.tool);
        if (event.status !== 'ok') {
          row.failedCalls += 1;
          break;
        }
        row.calls += 1;
        if (event.tool === 'search_articles') bump(event, 'searches');
        for (const { journal: name, cards } of event.cardsByJournal) {
          journal(name).cardsShown += cards;
          row.cardsShown += cards;
          bump(event, 'cardsShown', cards);
        }
        break;
      }
      case 'landing_visit':
        journal(event.journal).visits += 1;
        tool(event.tool ?? 'unknown').visits += 1;
        bump(event, 'visits');
        break;
      case 'landing_action':
        journal(event.journal).actions += 1;
        actions.set(event.action, (actions.get(event.action) ?? 0) + 1);
        bump(event, 'actions');
        break;
    }
  };

  const result = (): Funnel => ({
    period: first === undefined || last === undefined ? undefined : { first, last },
    events: seen.size,
    duplicates,
    totals: { ...totals, clickThrough: rate(totals.visits, totals.cardsShown) },
    byJournal: [...journals]
      .map(([name, row]) => ({
        journal: name,
        ...row,
        clickThrough: rate(row.visits, row.cardsShown),
      }))
      .sort((a, b) => b.cardsShown - a.cardsShown || b.visits - a.visits || byName(a, b)),
    byTool: [...tools]
      .map(([name, row]) => ({ tool: name, ...row }))
      .sort((a, b) => b.calls - a.calls || a.tool.localeCompare(b.tool)),
    byAction: [...actions]
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count || ACTIONS.indexOf(a.action) - ACTIONS.indexOf(b.action)),
    byDay: [...days]
      .map(([day, row]) => ({ day, ...row }))
      .sort((a, b) => a.day.localeCompare(b.day)),
  });

  return { add, result };
}

function covers(options: FunnelOptions, event: UsageEvent): boolean {
  if (options.from !== undefined && event.occurredAt < options.from) return false;
  if (options.to !== undefined && event.occurredAt >= options.to) return false;
  return true;
}

function rate(part: number, whole: number): number | undefined {
  return whole === 0 ? undefined : part / whole;
}

function byName(a: { journal: string }, b: { journal: string }): number {
  return a.journal.localeCompare(b.journal);
}

function getOrAdd<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  let value = map.get(key);
  if (value === undefined) {
    value = create();
    map.set(key, value);
  }
  return value;
}
