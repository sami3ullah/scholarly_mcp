import {
  chunkSourceSchema,
  incrementalWindow,
  type ArticleRecord,
  type ArticleWriter,
  type Clock,
  type Embedder,
  type Logger,
  type Source,
  type SyncState,
  type SyncStateStore,
} from '@scholarly-mcp/core';
import type { BuildKind } from '@scholarly-mcp/store-sqlite';
import { prepareRecord, type RecordLookup } from './prepare-record.js';

/** What a run needs; the composition root passes real adapters, tests pass fakes. */
export interface IngestDeps {
  readonly source: Source;
  readonly embedder: Embedder;
  readonly writer: ArticleWriter;
  readonly syncState: SyncStateStore;
  /** Records embedded by an earlier index, reused when their content is unchanged. */
  readonly previous?: RecordLookup;
  readonly clock: Clock;
  readonly logger: Logger;
}

/** Counts of one run. `written` is what changed in the index: 0 on a repeated run. */
export interface IngestReport {
  readonly kind: BuildKind;
  readonly resumed: boolean;
  readonly pages: number;
  readonly fetched: number;
  readonly unchanged: number;
  readonly reused: number;
  readonly embedded: number;
  readonly written: number;
}

/**
 * Runs one ingestion pass from a source into the index being built (PLAN.md "Phase 2").
 * A full run fetches everything; an incremental run fetches what changed since the window
 * `incrementalWindow` picks. A run left `running` or `failed` with a cursor is resumed from
 * that cursor. Unchanged records (same `contentHash`) are skipped, so a repeated run writes
 * nothing. Each page is written in one transaction, then checkpointed; on failure the
 * checkpoint is marked failed and the error is rethrown.
 */
export async function runIngest(
  deps: IngestDeps,
  kind: BuildKind,
  signal: AbortSignal,
): Promise<IngestReport> {
  const { source, writer, syncState, clock } = deps;
  const logger = deps.logger.child({ source: source.name, kind });
  const chunkSource = chunkSourceSchema.parse(source.name);
  let state = startState(source.name, await syncState.load(source.name, signal), kind, clock.now());
  const resumed = state.cursor !== undefined;
  const counts = { pages: 0, fetched: 0, unchanged: 0, reused: 0, embedded: 0, written: 0 };
  logger.info({ resumed, updatedSince: state.windowFrom?.toISOString() }, 'Ingest run started');
  await syncState.save(state, signal);

  try {
    do {
      const page = await source.fetchPage(
        {
          ...(state.cursor !== undefined && { cursor: state.cursor }),
          ...(state.windowFrom !== undefined && { updatedSince: state.windowFrom }),
        },
        signal,
      );
      const records: ArticleRecord[] = [];
      for (const article of page.articles) {
        if ((await writer.contentHashOf(article.doi, signal)) === article.contentHash) {
          counts.unchanged += 1;
          continue;
        }
        const prepared = await prepareRecord(article, { ...deps, chunkSource }, signal);
        counts[prepared.kind] += 1;
        records.push(prepared.record);
      }
      await writer.upsert(records, signal);
      counts.pages += 1;
      counts.fetched += page.articles.length;
      counts.written += records.length;
      state = withCursor(state, page.nextCursor);
      await syncState.save(state, signal);
      logger.info({ ...counts }, 'Ingest page written');
    } while (state.cursor !== undefined);
  } catch (error) {
    await markFailed(syncState, state, logger);
    logger.error({ err: error, ...counts }, 'Ingest run failed');
    throw error;
  }

  await syncState.save(
    {
      ...state,
      lastRunStatus: 'succeeded',
      lastRunAt: clock.now(),
      ...(kind === 'full' &&
        state.windowUntil !== undefined && { lastFullRunAt: state.windowUntil }),
    },
    signal,
  );
  logger.info({ ...counts }, 'Ingest run finished');
  return { kind, resumed, ...counts };
}

/**
 * The checkpoint a run starts from: an unfinished run's own checkpoint when it has a cursor,
 * otherwise a new window ending now. Full runs fetch everything. A full run's window end
 * becomes `lastFullRunAt` when it succeeds.
 */
function startState(
  source: string,
  previous: SyncState | undefined,
  kind: BuildKind,
  now: Date,
): SyncState {
  if (previous !== undefined && previous.lastRunStatus !== 'succeeded' && previous.cursor) {
    return { ...previous, lastRunStatus: 'running', lastRunAt: now };
  }
  const window = kind === 'full' ? { until: now } : incrementalWindow(previous, now);
  return {
    source,
    ...(window.updatedSince !== undefined && { windowFrom: window.updatedSince }),
    windowUntil: window.until,
    lastRunStatus: 'running',
    lastRunAt: now,
    ...(previous?.lastFullRunAt !== undefined && { lastFullRunAt: previous.lastFullRunAt }),
  };
}

function withCursor(state: SyncState, cursor: string | undefined): SyncState {
  const next = { ...state };
  delete next.cursor;
  return cursor === undefined ? next : { ...next, cursor };
}

/**
 * Marks the checkpoint failed, keeping its cursor so the next run resumes there. Uses a
 * fresh signal, because the run's own may be the reason it failed.
 */
async function markFailed(store: SyncStateStore, state: SyncState, logger: Logger) {
  try {
    await store.save({ ...state, lastRunStatus: 'failed' }, new AbortController().signal);
  } catch (saveError) {
    logger.error({ err: saveError }, 'Could not mark the ingest run failed');
  }
}
