import { existsSync } from 'node:fs';
import type { Clock, Embedder, Logger, Source } from '@scholarly-mcp/core';
import {
  beginIndexBuild,
  createSqliteIndexStore,
  openDatabase,
  verifyIndex,
  type Db,
  type VerifyReport,
} from '@scholarly-mcp/store-sqlite';
import { planRun, type IngestCommand, type RunPlan } from './plan-run.js';
import { runIngest, type IngestReport } from './run-ingest.js';

/**
 * A new index may hold at most this share fewer articles than the live one. More means a
 * source or filter broke, and the live index is kept (PLAN.md "Crash halfway through a run").
 */
export const MAX_SHRINK = 0.1;

export interface IngestIndexDeps {
  readonly indexPath: string;
  readonly fullRunDays: number;
  readonly source: Source;
  /** Loaded only once a run is certain, as loading the model takes seconds. */
  readonly loadEmbedder: () => Promise<Embedder>;
  readonly clock: Clock;
  readonly logger: Logger;
}

/** What `ingest full` and `ingest incremental` did. */
export interface IngestOutcome {
  readonly plan: RunPlan;
  readonly report: IngestReport;
  readonly verify: VerifyReport;
  /** True when the new index was swapped in; false leaves the live index untouched. */
  readonly committed: boolean;
}

/**
 * Builds an index next to the live one, verifies it and swaps it in (PLAN.md "SQLite
 * store"). A full run reuses the live index's embeddings for unchanged articles. When the run
 * fails, the build file is kept so the next run of the same kind resumes it.
 */
export async function ingestIndex(
  command: IngestCommand,
  deps: IngestIndexDeps,
  signal: AbortSignal,
): Promise<IngestOutcome> {
  const { indexPath, clock, logger } = deps;
  const live = existsSync(indexPath) ? openDatabase(indexPath, { readonly: true }) : undefined;
  try {
    const liveStore = live && createSqliteIndexStore(live);
    const liveMeta = await liveStore?.reader.indexMeta(signal);
    const liveState = await liveStore?.syncState.load(deps.source.name, signal);
    const plan = planRun(
      command,
      liveMeta && { syncState: liveState },
      clock.now(),
      deps.fullRunDays,
    );
    logger.info({ kind: plan.kind, reason: plan.reason }, 'Ingest planned');

    const embedder = await deps.loadEmbedder();
    const build = beginIndexBuild({ indexPath, kind: plan.kind, now: clock.now() });
    try {
      const report = await runIngest(
        {
          ...deps,
          embedder,
          writer: build.store.writer,
          syncState: build.store.syncState,
          ...(plan.kind === 'full' && liveStore && { previous: liveStore }),
        },
        plan.kind,
        signal,
      );
      const verify = await verifyIndex(
        build.db,
        {
          modelVersion: embedder.modelVersion,
          minArticleCount: Math.ceil((liveMeta?.articleCount ?? 0) * (1 - MAX_SHRINK)),
        },
        signal,
      );
      const outcome = (committed: boolean): IngestOutcome => ({
        plan,
        report: { ...report, resumed: report.resumed || build.resumed },
        verify,
        committed,
      });
      if (!verify.ok) {
        // A build that fails verification would fail again when resumed; start over next time.
        build.discard();
        return outcome(false);
      }
      closeLive(live);
      const builtAt = clock.now();
      build.commit({
        version: builtAt.toISOString(),
        modelVersion: embedder.modelVersion,
        articleCount: verify.articleCount,
        chunkCount: verify.chunkCount,
        builtAt,
      });
      return outcome(true);
    } catch (error) {
      if (build.db.open) build.close();
      throw error;
    }
  } finally {
    closeLive(live);
  }
}

/** `ingest verify`: checks the live index as it is, without changing it. */
export async function verifyLiveIndex(
  indexPath: string,
  modelVersion: string,
  signal: AbortSignal,
): Promise<VerifyReport> {
  // Not read-only: FTS5 runs its integrity check as an INSERT, which writes nothing.
  const db = openDatabase(indexPath, { mustExist: true });
  try {
    return await verifyIndex(db, { modelVersion }, signal);
  } finally {
    db.close();
  }
}

function closeLive(live: Db | undefined): void {
  if (live?.open === true) live.close();
}
