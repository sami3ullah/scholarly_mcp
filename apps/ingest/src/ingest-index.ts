import { existsSync } from 'node:fs';
import {
  appError,
  chunkSchema,
  embeddingTextOf,
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
  /** Loaded first: the plan depends on whether the live index used the same model. */
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
    const liveModel = (await liveStore?.reader.indexMeta(signal))?.modelVersion;
    const embedder = await deps.loadEmbedder();
    const plan = planRun(
      command,
      live && {
        syncState: liveState,
        currentLayout,
        sameModel: liveModel === undefined || liveModel === embedder.modelVersion,
      },
      clock.now(),
      deps.fullRunDays,
    );
    logger.info(
      { kind: plan.kind, reason: plan.reason, model: embedder.modelVersion },
      'Ingest planned',
    );

    const build = beginIndexBuild({
      indexPath,
      kind: plan.kind,
      now: clock.now(),
      dimensions: embedder.dimensions,
    });
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
/** The embedding model an index command works with, known before the model is loaded. */
export interface IndexModel {
  readonly version: string;
  readonly dimensions: number;
}

export interface PurgeDeps {
  readonly indexPath: string;
  /** `FULLTEXT_LICENSE_ALLOWLIST`; the licence to purge must no longer be on it. */
  readonly allowlist: readonly string[];
  readonly model: IndexModel;
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
  const { indexPath, clock, model } = deps;
  const build = beginIndexBuild({
    indexPath,
    kind: 'purge',
    now: clock.now(),
    dimensions: model.dimensions,
  });
  try {
    const purged = await build.store.purgeFullText(licenseUrl, signal);
    deps.logger.info({ ...purged }, 'Full text purged from the build');
    const verify = await verifyIndex(build.db, { modelVersion: model.version }, signal);
    if (!verify.ok) {
      build.discard();
      return { purged, verify, committed: false };
    }
    const builtAt = clock.now();
    build.commit({
      version: builtAt.toISOString(),
      modelVersion: model.version,
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
  readonly model: IndexModel;
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
    const { model } = deps;
    if (meta?.modelVersion !== model.version) {
      throw appError(
        'INVALID_INPUT',
        `The source index was built with ${meta?.modelVersion ?? 'no model'}, not ${model.version}`,
        { field: 'from' },
      );
    }
    const build = beginIndexBuild({
      indexPath: deps.indexPath,
      kind: 'full',
      now: deps.clock.now(),
      dimensions: model.dimensions,
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
      const verify = await verifyIndex(build.db, { modelVersion: model.version }, signal);
      if (!verify.ok) {
        build.discard();
        return { written, missing, verify, committed: false };
      }
      const builtAt = deps.clock.now();
      build.commit({
        version: builtAt.toISOString(),
        modelVersion: model.version,
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

export interface ReembedDeps {
  /** The index whose chunks are re-embedded; it is only read. */
  readonly sourcePath: string;
  /** Where the re-embedded index is built and swapped in. */
  readonly indexPath: string;
  readonly embedder: Embedder;
  readonly clock: Clock;
  readonly logger: Logger;
}

export interface ReembedOutcome {
  readonly written: number;
  /** Articles a resumed build already held, so they were not embedded again. */
  readonly kept: number;
  readonly chunks: number;
  readonly verify: VerifyReport;
  readonly committed: boolean;
}

/**
 * `ingest reembed`: builds a copy of an index whose chunks are embedded again by another
 * model, chunking unchanged, to compare models on the same text (SM-16, ADR 0028). Each
 * chunk is embedded from its stored text with the article title in front, as at ingestion,
 * so full text is never fetched again. An interrupted run resumes: articles already in the
 * build are kept.
 */
export async function reembedIndex(
  deps: ReembedDeps,
  signal: AbortSignal,
): Promise<ReembedOutcome> {
  const { embedder, clock, logger } = deps;
  const source = openDatabase(deps.sourcePath, { readonly: true, mustExist: true });
  try {
    const store = createSqliteIndexStore(source);
    const dois = source.prepare('SELECT doi FROM articles ORDER BY doi').pluck().all() as Doi[];
    const build = beginIndexBuild({
      indexPath: deps.indexPath,
      kind: 'full',
      now: clock.now(),
      dimensions: embedder.dimensions,
    });
    try {
      const counts = { written: 0, kept: 0, chunks: 0 };
      for (let start = 0; start < dois.length; start += SUBSET_BATCH) {
        const records: ArticleRecord[] = [];
        for (const doi of dois.slice(start, start + SUBSET_BATCH)) {
          const record = await store.findRecord(doi, signal);
          if (record === undefined) continue;
          const held = await build.store.writer.contentHashOf(doi, signal);
          if (held === record.article.contentHash) {
            counts.kept += 1;
            continue;
          }
          records.push(await reembedRecord(record, embedder, signal));
          counts.chunks += record.chunks.length;
        }
        await build.store.writer.upsert(records, signal);
        counts.written += records.length;
        logger.info({ ...counts, of: dois.length }, 'Re-embedded batch written');
      }
      const verify = await verifyIndex(build.db, { modelVersion: embedder.modelVersion }, signal);
      if (!verify.ok) {
        build.discard();
        return { ...counts, verify, committed: false };
      }
      const builtAt = clock.now();
      build.commit({
        version: builtAt.toISOString(),
        modelVersion: embedder.modelVersion,
        articleCount: verify.articleCount,
        chunkCount: verify.chunkCount,
        builtAt,
      });
      return { ...counts, verify, committed: true };
    } catch (error) {
      if (build.db.open) build.close();
      throw error;
    }
  } finally {
    source.close();
  }
}

async function reembedRecord(
  record: ArticleRecord,
  embedder: Embedder,
  signal: AbortSignal,
): Promise<ArticleRecord> {
  const { article, chunks } = record;
  const vectors = await embedder.embedPassages(
    chunks.map((chunk) => embeddingTextOf(article.title, chunk)),
    signal,
  );
  return {
    article,
    chunks: chunks.map((chunk, i) => {
      const embedding = vectors[i];
      if (embedding === undefined)
        throw new Error(`The embedder returned no vector for ${chunk.id}`);
      return chunkSchema.parse({ ...chunk, embedding, modelVersion: embedder.modelVersion });
    }),
  };
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
