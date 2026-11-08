import {
  appError,
  chunkSchema,
  embeddingTextOf,
  type ArticleEnricher,
  type JournalSubjects,
  type ArticleRecord,
  type Clock,
  type Doi,
  type Embedder,
  type IndexBuild,
  type IndexStorage,
  type IndexStore,
  type LiveIndexView,
  type Logger,
  type PurgeCounts,
  type Source,
  type VerifyOptions,
  type VerifyReport,
} from '@scholarly-mcp/core';
import { planRun, type IngestCommand, type RunPlan } from './plan-run.js';
import { runIngest, type IngestReport } from './run-ingest.js';

/**
 * A new index may hold at most this share fewer articles than the live one. More means a source or
 * filter broke, and the live index is kept (ARCHITECTURE.md "Crash halfway through a run").
 */
const MAX_SHRINK = 0.1;

export interface IngestIndexDeps {
  /** Where the live index is and the build goes: a SQLite file or Postgres (ADR 0034). */
  readonly storage: IndexStorage;
  readonly fullRunDays: number;
  readonly source: Source;
  /** Europe PMC subjects and matching-only full text, when `EUROPEPMC_ENABLED` (ADR 0024). */
  readonly enricher?: ArticleEnricher;
  /** Journal-level subjects for articles the enricher gave none (ADR 0004). */
  readonly journalSubjects?: JournalSubjects;
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
 * Builds an index next to the live one, verifies it and swaps it in (ARCHITECTURE.md "SQLite
 * store", ADR 0034). A full run reuses the live index's embeddings for unchanged articles.
 * When the run fails, the build is kept so the next run of the same kind resumes it.
 */
export async function ingestIndex(
  command: IngestCommand,
  deps: IngestIndexDeps,
  signal: AbortSignal,
): Promise<IngestOutcome> {
  const { storage, clock, logger } = deps;
  const live = await storage.openLive(signal);
  try {
    // An index with an older layout is neither updated nor read for reuse; it is rebuilt.
    const liveStore = live?.store;
    const liveArticles = live?.articleCount ?? 0;
    const liveState = await liveStore?.syncState.load(deps.source.name, signal);
    const liveModel = (await liveStore?.reader.indexMeta(signal))?.modelVersion;
    const embedder = await deps.loadEmbedder();
    const plan = planRun(
      command,
      live && {
        syncState: liveState,
        currentLayout: liveStore !== undefined,
        sameModel: liveModel === undefined || liveModel === embedder.modelVersion,
      },
      clock.now(),
      deps.fullRunDays,
    );
    logger.info(
      { kind: plan.kind, reason: plan.reason, model: embedder.modelVersion },
      'Ingest planned',
    );

    const build = await storage.beginBuild(
      { kind: plan.kind, now: clock.now(), dimensions: embedder.dimensions },
      signal,
    );
    return await inBuild(build, async () => {
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
      const { verify, committed } = await verifyAndCommit(
        build,
        {
          modelVersion: embedder.modelVersion,
          minArticleCount: Math.ceil(liveArticles * (1 - MAX_SHRINK)),
        },
        {
          clock,
          // The SQLite build renames over the live file; nothing may hold it open then.
          beforeCommit: () => live?.close(),
        },
        signal,
      );
      return {
        plan,
        report: { ...report, resumed: report.resumed || build.resumed },
        verify,
        committed,
      };
    });
  } finally {
    await live?.close();
  }
}

/** Runs `work` in a build; when it throws, the build is kept for the next run to resume. */
async function inBuild<T>(build: IndexBuild, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    await build.close();
    throw error;
  }
}

/**
 * Verifies a build and makes it live, versioned by the time it was built. A build that
 * fails verification is discarded: it would fail again when resumed, so the next run starts
 * over.
 */
async function verifyAndCommit(
  build: IndexBuild,
  options: VerifyOptions,
  commit: { readonly clock: Clock; readonly beforeCommit?: () => Promise<void> | undefined },
  signal: AbortSignal,
): Promise<{ readonly verify: VerifyReport; readonly committed: boolean }> {
  const verify = await build.verify(options, signal);
  if (!verify.ok) {
    await build.discard(signal);
    return { verify, committed: false };
  }
  await commit.beforeCommit?.();
  const builtAt = commit.clock.now();
  await build.commit(
    {
      version: builtAt.toISOString(),
      modelVersion: options.modelVersion,
      articleCount: verify.articleCount,
      chunkCount: verify.chunkCount,
      builtAt,
    },
    signal,
  );
  return { verify, committed: true };
}

/** The embedding model an index command works with, known before the model is loaded. */
export interface IndexModel {
  readonly version: string;
  readonly dimensions: number;
}

/** What `ingest purge-license` needs. */
export interface PurgeDeps {
  readonly storage: IndexStorage;
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
  const { storage, clock, model } = deps;
  const build = await storage.beginBuild(
    { kind: 'purge', now: clock.now(), dimensions: model.dimensions },
    signal,
  );
  return inBuild(build, async () => {
    const purged = await build.store.purgeFullText(licenseUrl, signal);
    deps.logger.info({ ...purged }, 'Full text purged from the build');
    const outcome = await verifyAndCommit(
      build,
      { modelVersion: model.version },
      { clock },
      signal,
    );
    return { purged, ...outcome };
  });
}

export interface SubsetDeps {
  /** The index to copy from; it is only read. */
  readonly source: IndexStorage;
  /** Where the subset index is built and swapped in. */
  readonly target: IndexStorage;
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

/** Articles copied or re-embedded per transaction. */
const COPY_BATCH = 100;

/**
 * `ingest subset`: builds a small index from chosen articles of a bigger one, such as the
 * eval index (ADR 0026). Articles keep their chunks and embeddings, so nothing is
 * fetched or embedded, and the subset is verified like any other build.
 */
export async function extractSubset(
  dois: readonly string[],
  deps: SubsetDeps,
  signal: AbortSignal,
): Promise<SubsetOutcome> {
  const { model, clock } = deps;
  const source = await openSource(deps.source, signal);
  try {
    await assertSourceModel(source, model, signal);
    const build = await deps.target.beginBuild(
      { kind: 'full', now: clock.now(), dimensions: model.dimensions },
      signal,
    );
    return await inBuild(build, async () => {
      const { written, missing } = await copyArticles(source, build, dois, signal);
      const outcome = await verifyAndCommit(
        build,
        { modelVersion: model.version },
        { clock },
        signal,
      );
      return { written, missing, ...outcome };
    });
  } finally {
    await source.close();
  }
}

export interface CopyDeps {
  /** The index to copy, such as a SQLite file; it is only read. */
  readonly source: IndexStorage;
  /** The store whose live index the copy replaces, such as Postgres (ADR 0034). */
  readonly target: IndexStorage;
  readonly model: IndexModel;
  /** Sources whose sync state moves with the articles, so the next incremental run goes on. */
  readonly sources: readonly string[];
  readonly clock: Clock;
  readonly logger: Logger;
}

export interface CopyOutcome {
  readonly written: number;
  readonly verify: VerifyReport;
  readonly committed: boolean;
}

/**
 * `ingest copy`: moves a whole index into another store, such as the SQLite eval index or a
 * production file into Postgres, with its chunks, embeddings and sync state, so nothing is
 * fetched or embedded. It runs as a full build of the target and replaces its live index
 * only once the copy verifies with every article of the source. A leftover build in the
 * target is dropped first: it may come from a Crossref run, and must not mix into the copy.
 */
export async function copyIndex(deps: CopyDeps, signal: AbortSignal): Promise<CopyOutcome> {
  const { model, clock, logger } = deps;
  const source = await openSource(deps.source, signal);
  try {
    await assertSourceModel(source, model, signal);
    const begin = () =>
      deps.target.beginBuild(
        { kind: 'full', now: clock.now(), dimensions: model.dimensions },
        signal,
      );
    let build = await begin();
    if (build.resumed) {
      logger.warn({ kind: build.kind }, 'Dropping a leftover build in the target before copying');
      await build.discard(signal);
      build = await begin();
    }
    return await inBuild(build, async () => {
      const { written } = await copyArticles(source, build, await source.dois(signal), signal);
      for (const name of deps.sources) {
        const state = await source.store.syncState.load(name, signal);
        if (state !== undefined) await build.store.syncState.save(state, signal);
      }
      const outcome = await verifyAndCommit(
        build,
        { modelVersion: model.version, minArticleCount: source.articleCount },
        { clock },
        signal,
      );
      return { written, ...outcome };
    });
  } finally {
    await source.close();
  }
}

/** `INVALID_INPUT` unless the source was embedded with the model this run is set up for. */
async function assertSourceModel(
  source: SourceIndex,
  model: IndexModel,
  signal: AbortSignal,
): Promise<void> {
  const meta = await source.store.reader.indexMeta(signal);
  if (meta?.modelVersion !== model.version) {
    throw appError(
      'INVALID_INPUT',
      `The source index was built with ${meta?.modelVersion ?? 'no model'}, not ${model.version}`,
      { field: 'from' },
    );
  }
}

/** Copies articles with their chunks and embeddings, in batches, into a build. */
async function copyArticles(
  source: SourceIndex,
  build: IndexBuild,
  dois: readonly string[],
  signal: AbortSignal,
): Promise<{ readonly written: number; readonly missing: readonly string[] }> {
  const missing: string[] = [];
  let written = 0;
  const wanted = [...new Set(dois)];
  for (let start = 0; start < wanted.length; start += COPY_BATCH) {
    const records: ArticleRecord[] = [];
    for (const doi of wanted.slice(start, start + COPY_BATCH)) {
      const record = await source.store.findRecord(doi as Doi, signal);
      if (record === undefined) missing.push(doi);
      else records.push(record);
    }
    await build.store.writer.upsert(records, signal);
    written += records.length;
  }
  return { written, missing };
}

export interface ReembedDeps {
  /** The index whose chunks are re-embedded; it is only read. */
  readonly source: IndexStorage;
  /** Where the re-embedded index is built and swapped in. */
  readonly target: IndexStorage;
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
 * model, chunking unchanged, to compare models on the same text (ADR 0028). Each
 * chunk is embedded from its stored text with the article title in front, as at ingestion,
 * so full text is never fetched again. An interrupted run resumes: articles already in the
 * build are kept.
 */
export async function reembedIndex(
  deps: ReembedDeps,
  signal: AbortSignal,
): Promise<ReembedOutcome> {
  const { embedder, clock, logger } = deps;
  const source = await openSource(deps.source, signal);
  try {
    const dois = await source.dois(signal);
    const build = await deps.target.beginBuild(
      { kind: 'full', now: clock.now(), dimensions: embedder.dimensions },
      signal,
    );
    return await inBuild(build, async () => {
      const counts = { written: 0, kept: 0, chunks: 0 };
      for (let start = 0; start < dois.length; start += COPY_BATCH) {
        const records: ArticleRecord[] = [];
        for (const doi of dois.slice(start, start + COPY_BATCH)) {
          const record = await source.store.findRecord(doi, signal);
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
      const outcome = await verifyAndCommit(
        build,
        { modelVersion: embedder.modelVersion },
        { clock },
        signal,
      );
      return { ...counts, ...outcome };
    });
  } finally {
    await source.close();
  }
}

type SourceIndex = LiveIndexView & { readonly store: IndexStore };

/** The live index of a copy's source; `INVALID_INPUT` when there is none to read. */
async function openSource(storage: IndexStorage, signal: AbortSignal): Promise<SourceIndex> {
  const live = await storage.openLive(signal);
  const store = live?.store;
  if (live === undefined || store === undefined) {
    await live?.close();
    throw appError('INVALID_INPUT', 'The source holds no index of the current layout', {
      field: 'from',
    });
  }
  return { ...live, store };
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
export function verifyLiveIndex(
  storage: IndexStorage,
  modelVersion: string,
  signal: AbortSignal,
): Promise<VerifyReport> {
  return storage.verifyLive({ modelVersion }, signal);
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
