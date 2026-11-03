import type { Doi } from '../article/doi.js';
import type { IndexMeta } from '../indexing/index-meta.js';
import type { VerifyReport } from '../indexing/verify-report.js';
import type { IndexStore } from './index-store.js';

/**
 * A full run starts from an empty index; an incremental run and a purge (removing full text
 * by licence) from a copy of the live one.
 */
export type BuildKind = 'full' | 'incremental' | 'purge';

/** What a build is checked against before it goes live. */
export interface VerifyOptions {
  /** The embedder's model version; every chunk must have it. */
  readonly modelVersion: string;
  /** Fails the check when fewer articles are indexed, e.g. 90% of the live index. */
  readonly minArticleCount?: number;
  /** How many articles the sample queries look for. */
  readonly samples?: number;
}

/** The live index as the ingest reads it, to plan a run and reuse embeddings. */
export interface LiveIndexView {
  /** Counted directly, so it works on older layouts too. */
  readonly articleCount: number;
  /** Absent when the index has an older layout: it is then rebuilt, never read or updated. */
  readonly store?: IndexStore;
  /** Every article's DOI in order, so a copy can walk the whole index. */
  dois(signal: AbortSignal): Promise<readonly Doi[]>;
  close(): Promise<void>;
}

/** An index being built beside the live one, made live only after it is verified. */
export interface IndexBuild {
  readonly kind: BuildKind;
  /** True when an interrupted build of the same kind was picked up again. */
  readonly resumed: boolean;
  readonly store: IndexStore;
  verify(options: VerifyOptions, signal: AbortSignal): Promise<VerifyReport>;
  /** Records `meta` and makes the build the live index. */
  commit(meta: IndexMeta, signal: AbortSignal): Promise<void>;
  /** Stops using the build and keeps it, so the next run of the same kind resumes it. */
  close(): Promise<void>;
  /** Drops the build, e.g. when it failed verification, so the next run starts over. */
  discard(signal: AbortSignal): Promise<void>;
}

/**
 * Where the ingest keeps the live index and builds the next one: a SQLite file swapped by
 * rename, or Postgres schemas behind a pointer (ADR 0022, ADR 0034).
 */
export interface IndexStorage {
  /** The live index, or undefined before the first commit. */
  openLive(signal: AbortSignal): Promise<LiveIndexView | undefined>;
  /**
   * Starts or resumes a build. A leftover build of the same kind and vector size is resumed;
   * any other is dropped. An incremental or purge build fails with `INDEX_UNAVAILABLE` when
   * there is no live index of the current layout and vector size to copy.
   */
  beginBuild(
    options: { readonly kind: BuildKind; readonly now: Date; readonly dimensions: number },
    signal: AbortSignal,
  ): Promise<IndexBuild>;
  /** Checks the live index as it is; `INDEX_UNAVAILABLE` when there is none. */
  verifyLive(options: VerifyOptions, signal: AbortSignal): Promise<VerifyReport>;
}
