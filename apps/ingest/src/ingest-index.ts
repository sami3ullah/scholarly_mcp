import { existsSync } from 'node:fs';
import {
  appError,
  type ArticleEnricher,
  type ArticleRecord,
  type Clock,
  type Doi,
  type Embedder,
  type Logger,
  type Source,
} from '@scholarly-mcp/core';
import {
  INDEX_SCHEMA_VERSION,
  beginIndexBuild,
  createSqliteIndexStore,
  indexSchemaVersion,
  openDatabase,
  verifyIndex,
  type Db,
  type PurgeCounts,
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
  /** Europe PMC subjects and matching-only full text, when `EUROPEPMC_ENABLED` (ADR 0024). */
  readonly enricher?: ArticleEnricher;
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
    // An index with an older layout is neither updated nor read for reuse; it is rebuilt.
    const currentLayout = live !== undefined && indexSchemaVersion(live) === INDEX_SCHEMA_VERSION;
    const liveStore = currentLayout ? createSqliteIndexStore(live) : undefined;
    const liveArticles = live === undefined ? 0 : articleCountOf(live);
    const liveState = await liveStore?.syncState.load(deps.source.name, signal);
    const plan = planRun(
      command,
      live && { syncState: liveState, currentLayout },
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
          minArticleCount: Math.ceil(liveArticles * (1 - MAX_SHRINK)),
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

/** What `ingest purge-license` needs. */
export interface PurgeDeps {
  readonly indexPath: string;
  /** `FULLTEXT_LICENSE_ALLOWLIST`; the licence to purge must no longer be on it. */
  readonly allowlist: readonly string[];
  readonly modelVersion: string;
  readonly clock: Clock;
  readonly logger: Logger;
}

/** What `ingest purge-license` did. */
export interface PurgeOutcome {
  readonly purged: PurgeCounts;
  readonly verify: VerifyReport;
  readonly committed: boolean;
}

/**
 * `ingest purge-license <url>`: removes every full-text chunk indexed under a licence, e.g.
 * when a rights holder asks (ADR 0003 guardrail 3). It runs as a build like any other: a
 * copy of the live index is purged, verified and swapped in, so the server never sees a
 * half-done purge. The licence must first be taken off the allowlist, or the next run would
 * index the same text again.
 */
export async function purgeLicense(
  licenseUrl: string,
  deps: PurgeDeps,
  signal: AbortSignal,
): Promise<PurgeOutcome> {
  if (deps.allowlist.some((url) => sameUrl(url, licenseUrl))) {
    throw appError(
      'INVALID_INPUT',
      'Remove the licence from FULLTEXT_LICENSE_ALLOWLIST before purging it, or the next run re-indexes it',
      { field: 'FULLTEXT_LICENSE_ALLOWLIST' },
    );
  }
  const { indexPath, clock } = deps;
  const build = beginIndexBuild({ indexPath, kind: 'purge', now: clock.now() });
  try {
    const purged = await build.store.purgeFullText(licenseUrl, signal);
    deps.logger.info({ ...purged }, 'Full text purged from the build');
    const verify = await verifyIndex(build.db, { modelVersion: deps.modelVersion }, signal);
    if (!verify.ok) {
      build.discard();
      return { purged, verify, committed: false };
    }
    const builtAt = clock.now();
    build.commit({
      version: builtAt.toISOString(),
      modelVersion: deps.modelVersion,
      articleCount: verify.articleCount,
      chunkCount: verify.chunkCount,
      builtAt,
    });
    return { purged, verify, committed: true };
  } catch (error) {
    if (build.db.open) build.close();
    throw error;
  }
}

export interface SubsetDeps {
  /** The index to copy from; it is only read. */
  readonly sourcePath: string;
  /** Where the subset index is built and swapped in. */
  readonly indexPath: string;
  readonly modelVersion: string;
  readonly clock: Clock;
  readonly logger: Logger;
}

export interface SubsetOutcome {
  readonly written: number;
  /** Requested DOIs the source index does not hold. */
  readonly missing: readonly string[];
  readonly verify: VerifyReport;
  readonly committed: boolean;
}

/** Articles copied per transaction. */
const SUBSET_BATCH = 100;

/**
 * `ingest subset`: builds a small index from chosen articles of a bigger one, such as the
 * committed eval index (SM-08). Articles keep their chunks and embeddings, so nothing is
 * fetched or embedded, and the subset is verified like any other build.
 */
export async function extractSubset(
  dois: readonly string[],
  deps: SubsetDeps,
  signal: AbortSignal,
): Promise<SubsetOutcome> {
  const source = openDatabase(deps.sourcePath, { readonly: true, mustExist: true });
  try {
    const store = createSqliteIndexStore(source);
    const meta = await store.reader.indexMeta(signal);
    if (meta?.modelVersion !== deps.modelVersion) {
      throw appError(
        'INVALID_INPUT',
        `The source index was built with ${meta?.modelVersion ?? 'no model'}, not ${deps.modelVersion}`,
        { field: 'from' },
      );
    }
    const build = beginIndexBuild({
      indexPath: deps.indexPath,
      kind: 'full',
      now: deps.clock.now(),
    });
    try {
      const missing: string[] = [];
      let written = 0;
      const wanted = [...new Set(dois)];
      for (let start = 0; start < wanted.length; start += SUBSET_BATCH) {
        const records: ArticleRecord[] = [];
        for (const doi of wanted.slice(start, start + SUBSET_BATCH)) {
          const record = await store.findRecord(doi as Doi, signal);
          if (record === undefined) missing.push(doi);
          else records.push(record);
        }
        await build.store.writer.upsert(records, signal);
        written += records.length;
      }
      const verify = await verifyIndex(build.db, { modelVersion: deps.modelVersion }, signal);
      if (!verify.ok) {
        build.discard();
        return { written, missing, verify, committed: false };
      }
      const builtAt = deps.clock.now();
      build.commit({
        version: builtAt.toISOString(),
        modelVersion: deps.modelVersion,
        articleCount: verify.articleCount,
        chunkCount: verify.chunkCount,
        builtAt,
      });
      return { written, missing, verify, committed: true };
    } catch (error) {
      if (build.db.open) build.close();
      throw error;
    }
  } finally {
    source.close();
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

/** Counted directly, as this works on any layout, old ones included. */
function articleCountOf(db: Db): number {
  return Number(db.prepare('SELECT count(*) FROM articles').pluck().get());
}

/** Licence URLs compared ignoring scheme, case and a trailing slash. */
function sameUrl(a: string, b: string): boolean {
  const canonical = (url: string) =>
    url
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '');
  return canonical(a) === canonical(b);
}

function closeLive(live: Db | undefined): void {
  if (live?.open === true) live.close();
}
